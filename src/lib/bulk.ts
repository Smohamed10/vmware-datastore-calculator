/**
 * Bulk assessment engine — template-based XLSX import, RVTools ingestion,
 * row-level validation/quarantine, and styled XLSX reporting for the
 * Storage Team. ExcelJS is used deliberately: first-party npm provenance,
 * active maintenance, styled writing. (SheetJS CE left the npm registry,
 * which is a supply-chain problem in a restricted bank CI.)
 */
import ExcelJS from "exceljs";
import { APP, POLICY } from "../config/policy";
import { calcDatastore, calcHealth, fmt, type HealthStatus, type Severity } from "./engine";
import { nextReportRef } from "./reportRef";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const RVTOOLS_PARSER_VERSION = "RVT-2026.2";

export function downloadBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ── Input model ───────────────────────────────────────────── */

export interface DatastoreInputRow {
  rowNumber: number;
  datastore: string;
  cluster: string;
  capacityGB: number;
  freeGB: number;
  usedGB: number | null; // null → inferred as capacity − free
  ramGB: number;
  memSnap: boolean;
  overheadPct: number; // percent, e.g. 10
  buffer: number;
  demandGB: number | null; // null → defaults to the overhead reserve
}

export interface AssessedRow {
  input: DatastoreInputRow;
  usedGB: number;
  reserveGB: number;
  requiredGB: number;
  health: HealthStatus;
  severity: Severity;
  recommendation: string;
}

export interface QuarantinedRow {
  rowNumber: number;
  datastore: string;
  reasons: string[];
}

export interface ParseOutcome {
  rows: DatastoreInputRow[];
  source: "template" | "rvtools";
  sheetName: string;
  inventory?: RVInventory;
}

/* ── Size parsing ──────────────────────────────────────────── */

const SIZE_MULT: Record<string, number> = {
  kb: 1 / 1048576, kib: 1 / 1048576,
  mb: 1 / 1024, mib: 1 / 1024,
  gb: 1, gib: 1,
  tb: 1024, tib: 1024,
  pb: 1048576, pib: 1048576,
};

/** Parses "1,024.00", "500 GB", "2 TB", plain numerics → GB. Header unit
 *  hint (e.g. "capacity mib") applies only when the value carries no unit. */
export function parseSizeToGB(raw: unknown, headerKey = ""): number | null {
  if (raw === null || raw === undefined) return null;
  const miBHint = headerKey.toLowerCase().includes("mib");
  if (typeof raw === "number") {
    if (isNaN(raw)) return null;
    return miBHint ? raw / 1024 : raw;
  }
  const s = String(raw).trim().toLowerCase().replace(/,/g, "");
  if (!s) return null;
  const m = s.match(/^(-?[\d.]+)\s*([kmgtp]i?b)?$/);
  if (!m) return null;
  let v = parseFloat(m[1]);
  if (isNaN(v)) return null;
  const unit = m[2];
  if (unit) v *= SIZE_MULT[unit] ?? 1;
  else if (miBHint) v /= 1024;
  return v;
}

/* ── Header mapping ────────────────────────────────────────── */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const FIELD_CANDIDATES: Record<keyof Omit<DatastoreInputRow, "rowNumber">, string[]> = {
  datastore: ["datastore", "datastorename", "name", "dsname", "ds"],
  cluster: ["cluster", "clustervcenter", "vcenter", "clustername"],
  capacityGB: ["capacitygb", "totalcapacitygb", "capacity", "capacitygib", "capacitygingb", "totalcapacity", "sizegb"],
  freeGB: ["freegb", "freespacegb", "freespace", "free", "freegib", "freespacegib"],
  usedGB: ["usedgb", "usedspacegb", "used", "usedspace", "usedgib", "consumedgb"],
  ramGB: ["totalvmramgb", "vmramgb", "ramgb", "vmram", "totalramgb"],
  memSnap: ["memorysnapshot", "memsnap", "includevmsn", "vmsn"],
  overheadPct: ["snapshotoverheadpct", "overheadpct", "snapshotoverhead", "overhead", "overheadpercent"],
  buffer: ["safetybuffer", "buffer", "bufferx"],
  demandGB: ["snapshotdemandgb", "demandgb", "peakdemandgb"],
};

function mapHeaders(keys: string[]): Partial<Record<keyof typeof FIELD_CANDIDATES, number>> {
  const out: Partial<Record<keyof typeof FIELD_CANDIDATES, number>> = {};
  keys.forEach((k, idx) => {
    for (const field of Object.keys(FIELD_CANDIDATES) as (keyof typeof FIELD_CANDIDATES)[]) {
      if (out[field] !== undefined) continue;
      if (FIELD_CANDIDATES[field].includes(norm(k))) out[field] = idx;
    }
  });
  return out;
}

interface SheetGrid {
  name: string;
  headerRowNumber: number;
  headers: string[];
  headerKeys: string[];
  rows: string[][];
  rowNumbers: number[];
}

function gridOf(ws: ExcelJS.Worksheet): SheetGrid {
  // Standard RVTools uses row 1, but merged/sanitized exports can prepend a
  // title or metadata row. Select the first plausible header in rows 1-10.
  let headerRowNumber = 1;
  let bestScore = -1;
  for (let r = 1; r <= Math.min(Math.max(ws.rowCount, 1), 10); r++) {
    const candidate = ws.getRow(r);
    const keys: string[] = [];
    for (let c = 1; c <= candidate.cellCount; c++) keys.push(norm(candidate.getCell(c).text.trim()));
    const score = keys.filter((k) =>
      ["vm", "vmname", "name", "datastore", "capacitymib", "capacitygb", "freespace", "freemib", "powerstate"].includes(k)
    ).length;
    if (score > bestScore) {
      bestScore = score;
      headerRowNumber = r;
    }
  }

  const headerRow = ws.getRow(headerRowNumber);
  const headers: string[] = [];
  for (let c = 1; c <= headerRow.cellCount; c++) headers.push(headerRow.getCell(c).text.trim());
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    const vals: string[] = [];
    for (let c = 1; c <= headers.length; c++) vals.push(row.getCell(c).text.trim());
    if (vals.some((v) => v !== "")) {
      rows.push(vals);
      rowNumbers.push(rowNumber);
    }
  });
  return { name: ws.name, headerRowNumber, headers, headerKeys: headers.map(norm), rows, rowNumbers };
}

/* ── Workbook parsing ──────────────────────────────────────── */

export async function parseWorkbookFile(file: File): Promise<ParseOutcome> {
  const wb = new ExcelJS.Workbook();
  const buf = await file.arrayBuffer();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);

  const sheetNames = wb.worksheets.map((w) => normalizedSheetName(w.name));
  if (sheetNames.includes("vdatastore")) {
    const inventory = parseRVInventory(wb);
    if (inventory.datastores.length === 0) {
      throw new Error("RVTools file detected, but the vDatastore sheet contains no usable rows (need Name / Capacity / Free columns).");
    }
    return { rows: inventoryToRows(inventory), source: "rvtools", sheetName: "vDatastore", inventory };
  }

  // Template path: first sheet whose headers cover datastore + capacity + free
  for (const ws of wb.worksheets) {
    const grid = gridOf(ws);
    const map = mapHeaders(grid.headers);
    if (map.datastore !== undefined && map.capacityGB !== undefined && map.freeGB !== undefined) {
      return { rows: extractTemplateRows(grid, map), source: "template", sheetName: ws.name };
    }
  }

  throw new Error(
    "Unrecognized file layout. Use the VCapacity template, or drop an RVTools export (vDatastore / vInfo / vDisk sheets)."
  );
}

function extractTemplateRows(grid: SheetGrid, map: Partial<Record<keyof typeof FIELD_CANDIDATES, number>>): DatastoreInputRow[] {
  const get = (vals: string[], field: keyof typeof FIELD_CANDIDATES) => {
    const i = map[field];
    return i === undefined ? "" : (vals[i] ?? "");
  };
  return grid.rows.map((vals, i) => {
    const freeRaw = get(vals, "freeGB");
    const usedRaw = get(vals, "usedGB");
    const demandRaw = get(vals, "demandGB");
    const overheadRaw = parseFloat(get(vals, "overheadPct"));
    const bufferRaw = parseFloat(get(vals, "buffer"));
    const ramRaw = parseSizeToGB(get(vals, "ramGB"));
    return {
      rowNumber: grid.rowNumbers[i],
      datastore: get(vals, "datastore"),
      cluster: get(vals, "cluster"),
      capacityGB: parseSizeToGB(get(vals, "capacityGB")) ?? NaN,
      freeGB: parseSizeToGB(freeRaw) ?? NaN,
      usedGB: usedRaw === "" ? null : parseSizeToGB(usedRaw),
      ramGB: ramRaw ?? 0,
      memSnap: /^y/i.test(get(vals, "memSnap")),
      overheadPct: isNaN(overheadRaw) ? POLICY.overheadPercent * 100 : overheadRaw,
      buffer: isNaN(bufferRaw) || bufferRaw <= 0 ? POLICY.safetyBuffer : bufferRaw,
      demandGB: demandRaw === "" ? null : parseSizeToGB(demandRaw),
    };
  });
}

/* ── RVTools ingestion ─────────────────────────────────────── */

export interface RVDatastore {
  name: string;
  capacityGB: number;
  freeGB: number;
  usedGB?: number | null;
  cluster?: string;
}
export interface RVVmDisk {
  datastore: string;
  provisionedGB: number;
}
export interface RVVm {
  name: string;
  ramGB: number;
  disks: RVVmDisk[];
  poweredOn: boolean;
}
export interface RVInventory {
  datastores: RVDatastore[];
  vms: RVVm[];
  diagnostics?: RVImportDiagnostics;
}

export interface RVImportDiagnostics {
  sheets: string[];
  vDatastoreHeaders: string[];
  vInfoHeaders: string[];
  vDiskHeaders: string[];
  diskRowsRead: number;
  diskRowsMapped: number;
  warnings: string[];
}

function findIdx(keys: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = keys.indexOf(c);
    if (i >= 0) return i;
  }
  // prefix match ("capacity mib" → capacitymib)
  return keys.findIndex((k) => candidates.some((c) => k.startsWith(c)));
}

function normalizedSheetName(name: string): string {
  // Older exports and third-party merges sometimes use tabvDisk/tabvInfo.
  return norm(name).replace(/^tab(?=v)/, "");
}

function findSheet(wb: ExcelJS.Workbook, wanted: string): ExcelJS.Worksheet | undefined {
  const key = norm(wanted);
  return wb.worksheets.find((w) => normalizedSheetName(w.name) === key);
}

function findStorageColumn(
  keys: string[],
  kind: "capacity" | "free" | "used" | "cluster"
): number {
  const exact: Record<typeof kind, string[]> = {
    capacity: ["capacitymib", "capacitymb", "capacitygib", "capacitygb", "capacity"],
    free: ["freemib", "freemb", "freegib", "freegb", "freespacemib", "freespacemb", "freespacegb", "freespace"],
    used: ["inusemib", "inusemb", "inusegib", "inusegb", "usedmib", "usedmb", "usedgb", "usedspace"],
    cluster: ["datastoreclustername", "storagepod", "cluster"],
  };
  for (const candidate of exact[kind]) {
    const idx = keys.indexOf(candidate);
    if (idx >= 0) return idx;
  }
  return keys.findIndex((k) => {
    if (k.includes("datastorecluster") && kind !== "cluster") return false;
    if (kind === "capacity") return k.startsWith("capacity") && !k.includes("percent");
    if (kind === "free") return k.startsWith("free") && !k.includes("percent") && !k.endsWith("pct");
    if (kind === "used") return (k.startsWith("inuse") || k.startsWith("used")) && !k.includes("percent");
    return k.includes("datastorecluster") || k === "cluster";
  });
}

/** Extracts the datastore from a VMware VMDK path:
 *  "[DS-PROD-01] folder/vm.vmdk" -> "DS-PROD-01". */
export function datastoreFromVmdkPath(value: unknown): string {
  const match = String(value ?? "").match(/^\s*\[([^\]]+)]/);
  return match?.[1]?.trim() ?? "";
}

export function parseRVInventory(wb: ExcelJS.Workbook): RVInventory {
  const diagnostics: RVImportDiagnostics = {
    sheets: wb.worksheets.map((w) => w.name),
    vDatastoreHeaders: [],
    vInfoHeaders: [],
    vDiskHeaders: [],
    diskRowsRead: 0,
    diskRowsMapped: 0,
    warnings: [],
  };

  const datastores: RVDatastore[] = [];
  const vds = findSheet(wb, "vdatastore");
  if (vds) {
    const g = gridOf(vds);
    diagnostics.vDatastoreHeaders = g.headers;
    const iName = findIdx(g.headerKeys, ["name", "datastore"]);
    const iCap = findStorageColumn(g.headerKeys, "capacity");
    const iFree = findStorageColumn(g.headerKeys, "free");
    const iUsed = findStorageColumn(g.headerKeys, "used");
    const iCluster = findStorageColumn(g.headerKeys, "cluster");
    if (iName >= 0 && iCap >= 0 && (iFree >= 0 || iUsed >= 0)) {
      g.rows.forEach((r) => {
        const name = r[iName]?.trim();
        const cap = parseSizeToGB(r[iCap], g.headerKeys[iCap]);
        const used = iUsed >= 0 ? parseSizeToGB(r[iUsed], g.headerKeys[iUsed]) : null;
        const explicitFree = iFree >= 0 ? parseSizeToGB(r[iFree], g.headerKeys[iFree]) : null;
        const free = explicitFree ?? (cap !== null && used !== null ? cap - used : null);
        if (name && cap !== null && cap > 0 && free !== null && free >= 0) {
          datastores.push({
            name,
            capacityGB: cap,
            freeGB: free,
            usedGB: used,
            cluster: iCluster >= 0 ? (r[iCluster]?.trim() ?? "") : "",
          });
        }
      });
    } else {
      diagnostics.warnings.push(
        `vDatastore columns not mapped. Found: ${g.headers.join(", ")}`
      );
    }
  }

  const ramByVm = new Map<string, number>();
  const powerByVm = new Map<string, boolean>();
  const vi = findSheet(wb, "vinfo");
  if (vi) {
    const g = gridOf(vi);
    diagnostics.vInfoHeaders = g.headers;
    const iVm = findIdx(g.headerKeys, ["vm", "vmname", "name"]);
    const iMem = findIdx(g.headerKeys, ["memory", "memorymb", "memorymib", "ram"]);
    const iPow = findIdx(g.headerKeys, ["powerstate", "power"]);
    if (iVm >= 0) {
      g.rows.forEach((r) => {
        const name = r[iVm]?.trim();
        if (!name) return;
        if (iMem >= 0) {
          const mb = parseFloat(String(r[iMem]).replace(/,/g, ""));
          ramByVm.set(name, isNaN(mb) ? 0 : mb / 1024); // vInfo Memory is MiB
        }
        powerByVm.set(name, iPow >= 0 ? /^poweredon/i.test(r[iPow] ?? "") : true);
      });
    }
  }

  const disksByVm = new Map<string, RVVmDisk[]>();
  const vd = findSheet(wb, "vdisk");
  if (vd) {
    const g = gridOf(vd);
    diagnostics.vDiskHeaders = g.headers;
    diagnostics.diskRowsRead = g.rows.length;
    const iVm = findIdx(g.headerKeys, ["vm", "vmname"]);
    const iDs = findIdx(g.headerKeys, ["datastore", "datastorename"]);
    const iCap = findIdx(g.headerKeys, ["capacity"]); // "capacity mib" or "capacity gb"
    // Real RVTools vDisk normally has no standalone Datastore column. The
    // datastore is embedded in the VMDK Path as "[datastore] file.vmdk".
    const iVmdkPath = findIdx(g.headerKeys, ["vmdkpath", "vmdkpathname", "filename", "path"]);
    if (iVm >= 0 && iCap >= 0 && (iDs >= 0 || iVmdkPath >= 0)) {
      g.rows.forEach((r) => {
        const vm = r[iVm]?.trim();
        let ds = iDs >= 0 ? (r[iDs]?.trim() ?? "") : "";
        if (!ds && iVmdkPath >= 0) ds = datastoreFromVmdkPath(r[iVmdkPath]);
        // Version-tolerant fallback: find any bracketed VMDK path in the row.
        if (!ds) {
          for (const cell of r) {
            ds = datastoreFromVmdkPath(cell);
            if (ds) break;
          }
        }
        const cap = parseSizeToGB(r[iCap], g.headerKeys[iCap]);
        if (vm && ds && cap !== null && cap > 0) {
          const arr = disksByVm.get(vm) ?? [];
          arr.push({ datastore: ds, provisionedGB: cap });
          disksByVm.set(vm, arr);
          diagnostics.diskRowsMapped += 1;
        }
      });
    } else {
      diagnostics.warnings.push(`vDisk columns not mapped. Found: ${g.headers.join(", ")}`);
    }
    if (diagnostics.diskRowsRead > 0 && diagnostics.diskRowsMapped === 0) {
      diagnostics.warnings.push(
        `Read ${diagnostics.diskRowsRead} vDisk rows but could not derive a datastore from the VMDK Path.`
      );
    } else if (diagnostics.diskRowsMapped < diagnostics.diskRowsRead) {
      diagnostics.warnings.push(
        `${diagnostics.diskRowsRead - diagnostics.diskRowsMapped} of ${diagnostics.diskRowsRead} vDisk rows were skipped because the capacity or VMDK datastore path was empty (for example, an RDM).`
      );
    }
  } else {
    diagnostics.warnings.push("No vDisk worksheet found.");
  }

  const vms: RVVm[] = Array.from(disksByVm.entries()).map(([name, disks]) => ({
    name,
    ramGB: ramByVm.get(name) ?? 0,
    disks,
    poweredOn: powerByVm.get(name) ?? true,
  }));

  return { datastores, vms, diagnostics };
}

/** Bulk-assessment rows derived from an RVTools inventory:
 *  RAM per datastore = Σ memory of VMs with at least one disk on it. */
export function inventoryToRows(inv: RVInventory): DatastoreInputRow[] {
  return inv.datastores.map((ds, i) => {
    const ramGB = inv.vms
      .filter((v) => v.disks.some((d) => d.datastore === ds.name))
      .reduce((s, v) => s + v.ramGB, 0);
    return {
      rowNumber: i + 2,
      datastore: ds.name,
      cluster: ds.cluster ?? "",
      capacityGB: ds.capacityGB,
      freeGB: ds.freeGB,
      usedGB: ds.usedGB ?? null,
      ramGB: +ramGB.toFixed(2),
      memSnap: false,
      overheadPct: POLICY.overheadPercent * 100,
      buffer: POLICY.safetyBuffer,
      demandGB: null,
    };
  });
}

/* ── Batch computation ─────────────────────────────────────── */

export function validateRow(r: DatastoreInputRow): string[] {
  const reasons: string[] = [];
  if (!r.datastore.trim()) reasons.push("missing datastore name");
  if (!(r.capacityGB > 0)) reasons.push("capacity must be greater than 0");
  if (isNaN(r.freeGB) || r.freeGB < 0) reasons.push("free space must be 0 or more");
  if (!isNaN(r.freeGB) && r.capacityGB > 0 && r.freeGB > r.capacityGB)
    reasons.push(`free space (${fmt(r.freeGB)} GB) exceeds capacity (${fmt(r.capacityGB)} GB)`);
  if (r.usedGB !== null && (r.usedGB < 0 || isNaN(r.usedGB))) reasons.push("used space is invalid");
  if (r.ramGB < 0) reasons.push("VM RAM cannot be negative");
  if (!(r.buffer >= 1)) reasons.push("safety buffer must be at least 1.0");
  if (r.overheadPct < 0 || r.overheadPct > 100) reasons.push("overhead must be 0–100%");
  if (r.demandGB !== null && (r.demandGB < 0 || isNaN(r.demandGB))) reasons.push("demand is invalid");
  return reasons;
}

export function assessRows(rows: DatastoreInputRow[]): { valid: AssessedRow[]; invalid: QuarantinedRow[] } {
  const valid: AssessedRow[] = [];
  const invalid: QuarantinedRow[] = [];

  for (const input of rows) {
    const reasons = validateRow(input);
    if (reasons.length > 0) {
      invalid.push({ rowNumber: input.rowNumber, datastore: input.datastore || "(unnamed)", reasons });
      continue;
    }
    const usedGB = input.usedGB ?? +(input.capacityGB - input.freeGB).toFixed(4);
    const reserveGB = +((input.capacityGB * input.overheadPct) / 100).toFixed(4);
    const demandGB = input.demandGB ?? reserveGB;
    const sizing = calcDatastore({ usedGB, ramGB: input.ramGB, snapGB: reserveGB, buffer: input.buffer, memSnap: input.memSnap });
    const health = calcHealth(input.capacityGB, input.freeGB, sizing.required, demandGB)!;

    let recommendation: string;
    if (!health.sufficient) recommendation = `Expand by ${fmt(health.gapGB, 2)} GB`;
    else if (!health.snapAuthorized) recommendation = "Free-space policy blocks snapshots — expand or reclaim capacity";
    else if (health.breachAtPeak) recommendation = "Monitor peak — schedule consolidation windows";
    else recommendation = "Ready — within policy";

    valid.push({
      input,
      usedGB,
      reserveGB,
      requiredGB: sizing.required,
      health,
      severity: health.sev,
      recommendation,
    });
  }
  return { valid, invalid };
}

/* ── Template generation ───────────────────────────────────── */

const MAROON = "FF7A1B37";
const GOLD = "FFC9A84C";
const DARK = "FF0E1424";

function styleHeader(row: ExcelJS.Row, fill = MAROON) {
  row.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: GOLD } } };
  });
  row.height = 30;
}

const TEMPLATE_HEADERS = [
  "Datastore", "Cluster", "Capacity (GB)", "Free (GB)", "Used (GB)",
  "VM RAM (GB)", "Memory Snapshot", "Overhead (%)", "Safety Buffer", "Demand (GB)",
];

export async function downloadTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = `${APP.name} v${APP.version}`;

  const ws = wb.addWorksheet("Datastores");
  ws.columns = TEMPLATE_HEADERS.map((_h, i) => ({ width: [22, 20, 15, 13, 12, 13, 17, 13, 14, 14][i] }));
  ws.addRow(TEMPLATE_HEADERS);
  styleHeader(ws.getRow(1));
  ws.addRow(["DS-EXAMPLE-01", "PROD-CLUSTER-01", 2048, 1024, "", 512, "No", 10, 1.25, ""]);
  ws.getRow(2).font = { italic: true, color: { argb: "FF8A94B0" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: "A1", to: "J1" };
  for (let r = 2; r <= 200; r++) {
    ws.getCell(`G${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Yes,No"'], showErrorMessage: true };
  }

  const guide = wb.addWorksheet("Assumptions");
  guide.columns = [{ width: 118 }];
  const lines = [
    ["VCAPACITY BULK ASSESSMENT — FIELD GUIDE", true],
    ["", false],
    ["Units: all capacity columns are in GB. Required per row: Datastore, Capacity, Free.", false],
    ["Leave 'Used' blank → inferred as Capacity − Free.   Leave 'Demand' blank → defaults to the overhead reserve.", false],
    ["", false],
    [`Overhead reserve = Overhead (%) × Capacity   (policy default ${POLICY.overheadPercent * 100}%)`, false],
    [`Required capacity  = (Used + RAM + Reserve) × Safety Buffer   (policy default ${POLICY.safetyBuffer})`, false],
    [`Snapshot authorization = Free ≥ ${POLICY.freeSpace.approvedPct}%  AND  Projected free at peak ≥ ${POLICY.freeSpace.warningPct}%`, false],
    ["Projected free at peak = Free − Demand", false],
    ["", false],
    ["Alternatively: drop an RVTools export on the Bulk Assessment tab — vDatastore / vInfo / vDisk sheets are auto-detected,", false],
    ["capacities and per-datastore VM RAM are computed with zero manual entry.", false],
    ["", false],
    [`${APP.formulaVersion} · ${APP.classification}`, false],
  ];
  lines.forEach(([text, bold]) => {
    const r = guide.addRow([text]);
    r.getCell(1).font = { bold: !!bold, color: { argb: bold ? GOLD : "FF3A4160" }, size: bold ? 13 : 11 };
  });

  const buf = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), "VCapacity-Bulk-Template.xlsx");
}

/* ── Bulk report export ────────────────────────────────────── */

const SEV_ARGB: Record<Severity, string> = { success: "FF22C55E", warning: "FFF59E0B", danger: "FFEF4444" };
const SEV_BG: Record<Severity, string> = { success: "FFE7F7EE", warning: "FFFCF2E2", danger: "FFFBE7E7" };

export async function exportBulkReport(
  valid: AssessedRow[],
  invalid: QuarantinedRow[],
  meta: { source: string; sheetName: string; fileName: string }
): Promise<string> {
  const ref = nextReportRef("VCB");
  const wb = new ExcelJS.Workbook();
  wb.creator = `${APP.name} v${APP.version}`;

  /* summary */
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 40 }, { width: 34 }];
  const counts = {
    approved: valid.filter((r) => r.health.status === "APPROVED").length,
    warning: valid.filter((r) => r.health.status === "WARNING").length,
    critical: valid.filter((r) => r.health.status === "CRITICAL").length,
    breaches: valid.filter((r) => r.health.breachAtPeak).length,
    denied: valid.filter((r) => !r.health.snapAuthorized).length,
    gap: valid.reduce((s, r) => s + (r.health.sufficient ? 0 : r.health.gapGB), 0),
    capacity: valid.reduce((s, r) => s + r.input.capacityGB, 0),
    required: valid.reduce((s, r) => s + r.requiredGB, 0),
  };
  const t = sum.addRow(["BULK CAPACITY ASSESSMENT — STORAGE TEAM REPORT"]);
  t.getCell(1).font = { bold: true, size: 16, color: { argb: MAROON } };
  t.height = 26;
  const metaRows: [string, string][] = [
    ["Reference", ref],
    ["Generated", new Date().toLocaleString()],
    ["Source", `${meta.fileName} (${meta.source === "rvtools" ? "RVTools" : "template"} · sheet "${meta.sheetName}")`],
    ["Import parser", meta.source === "rvtools" ? RVTOOLS_PARSER_VERSION : "VCapacity template"],
    ["Datastores assessed", String(valid.length)],
    ["Rows quarantined", String(invalid.length)],
    ["Approved / Warning / Critical", `${counts.approved} / ${counts.warning} / ${counts.critical}`],
    ["Peak free-space breaches", String(counts.breaches)],
    ["Snapshot authorizations denied", String(counts.denied)],
    ["Total capacity assessed", `${fmt(counts.capacity, 2)} GB`],
    ["Total required capacity", `${fmt(counts.required, 2)} GB`],
    ["Total expansion required", `${fmt(counts.gap, 2)} GB (${fmt(counts.gap / 1024, 3)} TB)`],
    ["", ""],
    [`Formula basis`, `${APP.formulaVersion} · buffer ${POLICY.safetyBuffer} · overhead reserve ${POLICY.overheadPercent * 100}% · thresholds ${POLICY.freeSpace.approvedPct}/${POLICY.freeSpace.warningPct}% free`],
    ["Classification", APP.classification],
  ];
  metaRows.forEach(([k, v]) => {
    const r = sum.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: DARK } };
    r.getCell(2).font = { color: { argb: "FF3A4160" } };
  });

  /* detail */
  const det = wb.addWorksheet("Assessments");
  const headers = [
    "#", "Datastore", "Cluster", "Capacity GB", "Free GB", "Free %",
    "Reserve GB", "VM RAM GB", "Buffer", "Required GB", "Expansion GB",
    "Peak Free %", "Snapshot Auth", "Status", "Recommendation",
  ];
  det.columns = headers.map((_h, i) => ({ width: [5, 26, 18, 13, 12, 9, 12, 12, 9, 13, 13, 11, 15, 11, 44][i] }));
  det.addRow(headers);
  styleHeader(det.getRow(1));
  det.views = [{ state: "frozen", ySplit: 1 }];
  det.autoFilter = { from: "A1", to: "O1" };

  valid.forEach((r, i) => {
    const h = r.health;
    const row = det.addRow([
      i + 1, r.input.datastore, r.input.cluster || "—",
      +r.input.capacityGB.toFixed(2), +r.input.freeGB.toFixed(2), h.freePct / 100,
      r.reserveGB, r.input.ramGB, r.input.buffer, +r.requiredGB.toFixed(2),
      h.sufficient ? 0 : h.gapGB, Math.max(h.projectedFreePct, 0) / 100,
      h.snapAuthorized ? "AUTHORIZED" : "DENIED", h.status, r.recommendation,
    ]);
    row.getCell(6).numFmt = "0.0%";
    row.getCell(12).numFmt = "0.0%";
    [13, 14].forEach((c) => {
      const cell = row.getCell(c);
      const sev: Severity = c === 13 ? (h.snapAuthorized ? "success" : "danger") : r.severity;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SEV_BG[sev] } };
      cell.font = { bold: true, color: { argb: SEV_ARGB[sev] }, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    if (i % 2) {
      for (let c = 1; c <= 12; c++) {
        const cell = row.getCell(c);
        if (!cell.fill || (cell.fill as ExcelJS.FillPattern).fgColor?.argb !== SEV_BG.success)
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF6F8FC" } };
      }
    }
  });

  /* quarantine */
  if (invalid.length > 0) {
    const q = wb.addWorksheet("Quarantined");
    q.columns = [{ width: 12 }, { width: 30 }, { width: 90 }];
    q.addRow(["Row #", "Datastore", "Rejection reasons"]);
    styleHeader(q.getRow(1), "FF8A2432");
    invalid.forEach((q2) => q.addRow([q2.rowNumber, q2.datastore, q2.reasons.join("; ")]));
  }

  const buf = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer;
  downloadBlob(new Blob([buf], { type: XLSX_MIME }), `Bulk-Assessment-${ref}.xlsx`);
  return ref;
}
