/**
 * Multi-VM snapshot planner engine — the math behind per-datastore
 * consolidation planning:
 *   delta(VM)   = min(write × retention × safetyFactor, provisioned size)
 *   peak(worst) = Σ delta            (all VMs snapshot simultaneously)
 *   peak(plan)  = max window demand  (staggered schedule, k concurrent)
 *   required    = (used + ΣRAM + peak) × safety buffer
 *   runway      = (free − peak) ÷ aggregate daily write rate
 */
import ExcelJS from "exceljs";
import { APP, POLICY } from "../config/policy";
import { fmt, type Severity } from "./engine";
import { downloadBlob, type RVInventory } from "./bulk";
import { nextReportRef } from "./reportRef";

export interface PlannerVM {
  id: string;
  name: string;
  provisionedGB: number;
  ramGB: number;
  writeGBDaily: number;
  retentionDays: number;
  memSnap: boolean;
  /** Number of distinct datastores this VM's disks live on (spanning). */
  spans: number;
}

export interface Guardrail {
  level: "warn" | "danger";
  msg: string;
}

export interface VMComputed extends PlannerVM {
  deltaRawGB: number;
  deltaGB: number;
  capped: boolean;
  memStateGB: number;
  totalGB: number;
  guardrails: Guardrail[];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function computeVM(vm: PlannerVM, sf = POLICY.snapshotSafetyFactor): VMComputed {
  const deltaRawGB = vm.writeGBDaily * vm.retentionDays * sf;
  // A delta file can never outgrow its base disk — cap at provisioned size.
  const capped = vm.provisionedGB > 0 && deltaRawGB > vm.provisionedGB;
  const deltaGB = capped ? vm.provisionedGB : deltaRawGB;
  const memStateGB = vm.memSnap ? vm.ramGB + POLICY.memoryStateOverheadGB : 0;

  const guardrails: Guardrail[] = [];
  if (vm.retentionDays > POLICY.maxSnapshotAgeDays) {
    guardrails.push({ level: "warn", msg: `Retention ${vm.retentionDays}d exceeds the ${POLICY.maxSnapshotAgeDays}d operational guideline` });
  }
  if (vm.provisionedGB > 0 && deltaGB >= vm.provisionedGB * 0.9) {
    guardrails.push({ level: "danger", msg: "Delta is saturating the base disk — consolidate immediately" });
  }
  if (vm.spans > 1) {
    guardrails.push({ level: "warn", msg: `Spans ${vm.spans} datastores — snapshot grows on all of them simultaneously` });
  }

  return { ...vm, deltaRawGB, deltaGB, capped, memStateGB, totalGB: deltaGB + memStateGB, guardrails };
}

export function peakWorst(vms: VMComputed[]): number {
  return vms.reduce((s, v) => s + v.totalGB, 0);
}

export interface WindowPlan {
  label: string;
  vmNames: string[];
  demandGB: number;
}

/**
 * Balanced window scheduler — LPT (longest-processing-time) greedy:
 * ceil(n/k) windows are pre-opened, then VMs (largest delta first) are
 * placed onto the least-loaded window that still has a free slot. This
 * minimizes peak window demand while honoring the concurrency cap.
 * Operational assumption: each window's snapshots are committed before the
 * next window starts, so peak demand = the largest window sum.
 */
export function scheduleWindows(vms: { name: string; totalGB: number }[], maxConcurrent: number): WindowPlan[] {
  if (vms.length === 0) return [];
  const k = Math.max(1, Math.min(Math.floor(maxConcurrent) || 1, vms.length));
  const wCount = Math.max(1, Math.ceil(vms.length / k));
  const windows: WindowPlan[] = Array.from({ length: wCount }, () => ({ label: "", vmNames: [], demandGB: 0 }));
  const sorted = [...vms].sort((a, b) => b.totalGB - a.totalGB);

  for (const vm of sorted) {
    let target = -1;
    let best = Infinity;
    for (let i = 0; i < windows.length; i++) {
      if (windows[i].vmNames.length >= k) continue;
      if (windows[i].demandGB < best) {
        best = windows[i].demandGB;
        target = i;
      }
    }
    if (target === -1) {
      // Defensive overflow — cannot happen since wCount × k ≥ n
      windows.push({ label: "", vmNames: [vm.name], demandGB: vm.totalGB });
    } else {
      windows[target].vmNames.push(vm.name);
      windows[target].demandGB += vm.totalGB;
    }
  }

  const used = windows.filter((w) => w.vmNames.length > 0);
  used.forEach((w, i) => (w.label = `Window ${i + 1}`));
  return used;
}

export interface PlannerStats {
  usedGB: number;
  ramTotalGB: number;
  dailyTotalGB: number;
  memTotalGB: number;
  peakWorstGB: number;
  requiredGB: number;
}

export function computeStats(capacityGB: number, freeGB: number, vms: VMComputed[], peakGB: number, buffer: number): PlannerStats {
  const usedGB = Math.max(capacityGB - freeGB, 0);
  const ramTotalGB = vms.reduce((s, v) => s + v.ramGB, 0);
  const dailyTotalGB = vms.reduce((s, v) => s + v.writeGBDaily, 0);
  const memTotalGB = vms.reduce((s, v) => s + v.memStateGB, 0);
  return {
    usedGB,
    ramTotalGB,
    dailyTotalGB,
    memTotalGB,
    peakWorstGB: peakWorst(vms),
    requiredGB: (usedGB + ramTotalGB + peakGB) * buffer,
  };
}

/** Days of uncommitted write growth the datastore can absorb beyond the
 *  planned peak before crossing zero free space. Negative = already breached. */
export function runwayDays(freeGB: number, peakGB: number, dailyTotalGB: number): number | null {
  if (dailyTotalGB <= 0) return null;
  return (freeGB - peakGB) / dailyTotalGB;
}

/* ── RVTools roster building ───────────────────────────────── */

export function rosterForDatastore(
  inv: RVInventory,
  dsName: string,
  opts: { changePct: number; retentionDays: number }
): PlannerVM[] {
  const out: PlannerVM[] = [];
  for (const v of inv.vms) {
    const here = v.disks.filter((d) => d.datastore === dsName);
    if (here.length === 0) continue;
    const provHere = here.reduce((s, d) => s + d.provisionedGB, 0);
    const spans = new Set(v.disks.map((d) => d.datastore)).size;
    out.push({
      id: uid(),
      name: v.name,
      provisionedGB: +provHere.toFixed(2),
      ramGB: +v.ramGB.toFixed(2),
      writeGBDaily: +((provHere * opts.changePct) / 100).toFixed(3),
      retentionDays: opts.retentionDays,
      memSnap: false,
      spans,
    });
  }
  return out.sort((a, b) => b.provisionedGB - a.provisionedGB);
}

/* ── Runbook export (change-management artifact) ───────────── */

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface RunbookMeta {
  datastore: string;
  capacityGB: number;
  freeGB: number;
  buffer: number;
  mode: "worst" | "staggered";
  maxConcurrent: number;
  stats: PlannerStats;
  projectedFreePct: number;
  authorized: boolean;
  status: string;
  /** Rounded-up capacity to add, and what drove it (sizing vs peak floor). */
  expansionGB?: number;
  expansionDriver?: "none" | "sizing" | "peak";
}

export async function exportPlannerRunbook(
  meta: RunbookMeta,
  vms: VMComputed[],
  windows: WindowPlan[]
): Promise<string> {
  const ref = nextReportRef("VCP");
  const wb = new ExcelJS.Workbook();
  wb.creator = `${APP.name} v${APP.version}`;

  const plan = wb.addWorksheet("Plan");
  plan.columns = [{ width: 38 }, { width: 46 }];
  const title = plan.addRow(["MULTI-VM SNAPSHOT CONSOLIDATION PLAN"]);
  title.getCell(1).font = { bold: true, size: 16, color: { argb: "FF7A1B37" } };
  title.height = 26;
  const rows: [string, string][] = [
    ["Reference", ref],
    ["Generated", new Date().toLocaleString()],
    ["Datastore", meta.datastore || "—"],
    ["Capacity / Free", `${fmt(meta.capacityGB, 2)} GB / ${fmt(meta.freeGB, 2)} GB`],
    ["Planning mode", meta.mode === "worst" ? "Worst case — all VMs snapshot together" : `Staggered — max ${meta.maxConcurrent} concurrent`],
    ["VMs in scope", String(vms.length)],
    ["Retention windows", (() => {
      const uniq = Array.from(new Set(vms.map((v) => v.retentionDays))).sort((a, b) => a - b);
      return uniq.length === 1 ? `${uniq[0]} day(s) — uniform` : `${uniq.join(" / ")} days — mixed per VM`;
    })()],
    ["Aggregate daily write", `${fmt(meta.stats.dailyTotalGB, 3)} GB/day`],
    ["Memory state captured", `${vms.filter((v) => v.memSnap).length} of ${vms.length} VMs`],
    ["Memory-state total", `${fmt(meta.stats.memTotalGB, 2)} GB`],
    ["Peak snapshot demand", `${fmt(meta.stats ? metaPeak(meta, windows) : 0, 2)} GB`],
    ["Used + RAM + Peak × buffer", `(${fmt(meta.stats.usedGB, 2)} + ${fmt(meta.stats.ramTotalGB, 2)} + ${fmt(metaPeak(meta, windows), 2)}) × ${meta.buffer}`],
    ["Required datastore capacity", `${fmt(meta.stats.requiredGB, 2)} GB`],
    ["Projected free at peak", `${fmt(meta.projectedFreePct, 2)}%`],
    [
      "REQUIRED INCREASE",
      (meta.expansionGB ?? 0) > 0
        ? `+${Math.ceil(meta.expansionGB!).toLocaleString("en-US")} GB  (driver: ${meta.expansionDriver === "peak" ? `snapshot peak vs ${POLICY.freeSpace.warningPct}% floor` : "required sizing"})`
        : "0 GB — no expansion required",
    ],
    ["Verdict", `${meta.status} — snapshots ${meta.authorized ? "AUTHORIZED" : "DENIED"}`],
    ["", ""],
    ["Formula basis", `${APP.formulaVersion} · safety factor ${POLICY.snapshotSafetyFactor} · buffer ${meta.buffer}`],
    ["Classification", APP.classification],
  ];
  rows.forEach(([k, v]) => {
    const r = plan.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: "FF0E1424" } };
    r.getCell(2).font = { color: { argb: "FF3A4160" } };
  });

  const vmSheet = wb.addWorksheet("VM Delta Analysis");
  const headers = ["VM", "Provisioned GB", "RAM GB", "Write GB/day", "Retention d", "Mem state GB", "Delta GB", "Capped", "Total GB", "Spans"];
  vmSheet.columns = headers.map((_h, i) => ({ width: [30, 15, 10, 14, 12, 14, 12, 9, 12, 8][i] }));
  vmSheet.addRow(headers);
  vmSheet.getRow(1).eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7A1B37" } };
    c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
    c.alignment = { horizontal: "center", vertical: "middle" };
  });
  vmSheet.views = [{ state: "frozen", ySplit: 1 }];
  vmSheet.autoFilter = { from: "A1", to: "J1" };
  vms.forEach((v) => {
    vmSheet.addRow([
      v.name, v.provisionedGB, v.ramGB, v.writeGBDaily, v.retentionDays,
      +v.memStateGB.toFixed(3), +v.deltaGB.toFixed(3), v.capped ? "YES" : "", +v.totalGB.toFixed(3), v.spans > 1 ? v.spans : "",
    ]);
  });

  if (windows.length > 0) {
    const w = wb.addWorksheet("Snapshot Schedule");
    w.columns = [{ width: 12 }, { width: 64 }, { width: 18 }];
    w.addRow(["Window", "VMs", "Peak demand GB"]);
    w.getRow(1).eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7A1B37" } };
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
    });
    windows.forEach((win) => {
      const isPeak = win.demandGB === Math.max(...windows.map((x) => x.demandGB));
      const row = w.addRow([win.label, win.vmNames.join(", "), +win.demandGB.toFixed(2)]);
      if (isPeak) {
        row.getCell(3).font = { bold: true, color: { argb: "FFB45309" } };
      }
    });
  }

  const flagged = vms.filter((v) => v.guardrails.length > 0);
  if (flagged.length > 0) {
    const g = wb.addWorksheet("Guardrails");
    g.columns = [{ width: 30 }, { width: 10 }, { width: 80 }];
    g.addRow(["VM", "Level", "Advisory"]);
    g.getRow(1).eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8A2432" } };
      c.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
    });
    flagged.forEach((v) =>
      v.guardrails.forEach((gr) => {
        const row = g.addRow([v.name, gr.level.toUpperCase(), gr.msg]);
        row.getCell(2).font = { bold: true, color: { argb: gr.level === "danger" ? "FFEF4444" : "FFF59E0B" } };
      })
    );
  }

  const buf = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), `Snapshot-Plan-${(meta.datastore || "datastore").replace(/\s+/g, "-")}-${ref}.xlsx`);
  return ref;
}

function metaPeak(meta: RunbookMeta, windows: WindowPlan[]): number {
  if (meta.mode === "worst" || windows.length === 0) return meta.stats.peakWorstGB;
  return Math.max(...windows.map((w) => w.demandGB));
}

export const SEV_TONE: Record<Severity, string> = { success: "var(--green)", warning: "var(--amber)", danger: "var(--red)" };
