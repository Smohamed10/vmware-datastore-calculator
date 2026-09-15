import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertTriangle, FileDown, Layers, Minus, Network, Plus, Upload, X } from "lucide-react";
import { APP, POLICY } from "../config/policy";
import { calcHealth, fmt, toGB, type Severity, type Unit, type UnitValue } from "../lib/engine";
import { parseWorkbookFile, type RVInventory } from "../lib/bulk";
import {
  computeStats, computeVM, exportPlannerRunbook, peakWorst, rosterForDatastore, runwayDays, scheduleWindows, uid,
  type PlannerVM, type VMComputed,
} from "../lib/planner";
import { usePersistentState } from "../lib/persist";
import { BigResult, Card, Field, Progress, Row, SectionLabel, StatusPanel } from "./ui";

const UV = (u: Unit = "GB"): UnitValue => ({ v: "", u });
type Mode = "worst" | "staggered";

interface Ctx {
  name: string;
  capacity: UnitValue;
  free: UnitValue;
  buffer: string;
}

export default function PlannerTab() {
  const [ctx, setCtx] = usePersistentState<Ctx>("pl.ctx", { name: "", capacity: UV("TB"), free: UV(), buffer: String(POLICY.safetyBuffer) });
  const [changePct, setChangePct] = usePersistentState("pl.changePct", "2");
  const [retention, setRetention] = usePersistentState("pl.retention", String(POLICY.maxSnapshotAgeDays));
  const [vms, setVms] = usePersistentState<PlannerVM[]>("pl.vms", []);
  const [mode, setMode] = usePersistentState<Mode>("pl.mode", "worst");
  const [maxConcurrent, setMaxConcurrent] = usePersistentState("pl.maxConcurrent", 3);
  const [inventory, setInventory] = usePersistentState<RVInventory | null>("pl.inventory.rvt-2026-2", null);
  const [selectedDs, setSelectedDs] = usePersistentState("pl.selectedDs.rvt-2026-2", "");

  const [newName, setNewName] = useState("");
  const [newProv, setNewProv] = useState("");
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const capGB = toGB(ctx.capacity.v, ctx.capacity.u);
  const freeGB = toGB(ctx.free.v, ctx.free.u);
  const sf = POLICY.snapshotSafetyFactor;

  const computed: VMComputed[] = useMemo(() => vms.map((v) => computeVM(v, sf)), [vms, sf]);
  const worst = useMemo(() => peakWorst(computed), [computed]);
  const windows = useMemo(
    () => (mode === "staggered" ? scheduleWindows(computed.map((c) => ({ name: c.name, totalGB: c.totalGB })), maxConcurrent) : []),
    [mode, computed, maxConcurrent]
  );
  const peak = mode === "worst" || windows.length === 0 ? worst : Math.max(...windows.map((w) => w.demandGB));
  const buffer = parseFloat(ctx.buffer) || POLICY.safetyBuffer;
  const stats = useMemo(() => computeStats(capGB, freeGB, computed, peak, buffer), [capGB, freeGB, computed, peak, buffer]);
  const health = useMemo(() => (capGB > 0 ? calcHealth(capGB, freeGB, stats.requiredGB, peak) : null), [capGB, freeGB, stats.requiredGB, peak]);
  const runway = runwayDays(freeGB, peak, stats.dailyTotalGB);
  const flagged = computed.filter((v) => v.guardrails.length > 0);

  /* ── roster mutations ── */
  function patchVM(id: string, patch: Partial<PlannerVM>) {
    setVms((list) => list.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }
  function removeVM(id: string) {
    setVms((list) => list.filter((v) => v.id !== id));
  }
  function addVM() {
    const prov = parseFloat(newProv) || 0;
    if (!newName.trim()) {
      toast.error("Give the VM a name");
      return;
    }
    const pct = parseFloat(changePct) || 2;
    const ret = parseInt(retention) || POLICY.maxSnapshotAgeDays;
    setVms((list) => [
      ...list,
      { id: uid(), name: newName.trim(), provisionedGB: prov, ramGB: 0, writeGBDaily: +((prov * pct) / 100).toFixed(3), retentionDays: ret, memSnap: false, spans: 1 },
    ]);
    setNewName("");
    setNewProv("");
  }
  function applyDefaultsToAll() {
    const pct = parseFloat(changePct) || 2;
    const ret = parseInt(retention) || POLICY.maxSnapshotAgeDays;
    setVms((list) => list.map((v) => ({ ...v, writeGBDaily: +((v.provisionedGB * pct) / 100).toFixed(3), retentionDays: ret })));
    toast.success("Defaults applied across the roster");
  }

  async function importRVTools(file: File) {
    try {
      const outcome = await parseWorkbookFile(file);
      if (!outcome.inventory || outcome.inventory.vms.length === 0) {
        const d = outcome.inventory?.diagnostics;
        const detail = d
          ? `vDisk rows read: ${d.diskRowsRead}; mapped: ${d.diskRowsMapped}. Columns: ${d.vDiskHeaders.join(", ") || "none"}`
          : "The workbook did not expose an RVTools inventory.";
        toast.error(`No VM disks could be mapped. ${detail}`, { duration: 10000 });
        return;
      }
      setInventory(outcome.inventory);
      loadDatastore(outcome.inventory, outcome.inventory.datastores[0]?.name ?? "");
      const mapped = outcome.inventory.diagnostics?.diskRowsMapped ?? 0;
      toast.success(
        `Inventory loaded — ${outcome.inventory.datastores.length} datastores, ${outcome.inventory.vms.length} VMs, ${mapped} disks mapped`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not parse the file");
    }
  }
  function loadDatastore(inv: RVInventory, dsName: string) {
    const ds = inv.datastores.find((d) => d.name === dsName);
    setSelectedDs(dsName);
    setCtx((c) => ({
      ...c,
      name: dsName,
      capacity: ds ? { v: ds.capacityGB.toFixed(2), u: "GB" } : c.capacity,
      free: ds ? { v: ds.freeGB.toFixed(2), u: "GB" } : c.free,
    }));
    setVms(rosterForDatastore(inv, dsName, { changePct: parseFloat(changePct) || 2, retentionDays: parseInt(retention) || POLICY.maxSnapshotAgeDays }));
  }

  async function doExport() {
    if (!health) {
      toast.error("Enter capacity and free space to export a plan");
      return;
    }
    setExporting(true);
    try {
      const ref = await exportPlannerRunbook(
        {
          datastore: ctx.name, capacityGB: capGB, freeGB, buffer, mode, maxConcurrent,
          stats, projectedFreePct: health.projectedFreePct, authorized: health.snapAuthorized, status: health.status,
        },
        computed,
        windows
      );
      toast.success(`Snapshot plan ${ref} exported`);
    } finally {
      setExporting(false);
    }
  }

  const projSev: Severity = health
    ? health.projectedFreePct >= POLICY.freeSpace.approvedPct
      ? "success"
      : health.projectedFreePct >= POLICY.freeSpace.warningPct
        ? "warning"
        : "danger"
    : "success";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 480px), 1fr))", gap: 22 }}>
      {/* ════════ INPUT ════════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card title="Datastore Context" sub="The datastore being planned — or let RVTools fill everything" accent="var(--maroon)" delay={0}>
          <div className="flex flex-wrap" style={{ gap: 10, marginBottom: 14 }}>
            <button onClick={() => fileRef.current?.click()} style={btnStyle("solid")}>
              <Upload size={14} />
              Import RVTools
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm"
              style={{ display: "none" }}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const f = e.target.files?.[0];
                if (f) void importRVTools(f);
                e.target.value = "";
              }}
            />
            {inventory && (
              <span style={{ alignSelf: "center", fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", padding: "4px 9px", borderRadius: 7, background: "var(--gold-bg)", color: "var(--gold)", border: "1px solid var(--gold-border)" }}>
                {inventory.datastores.length} datastores · {inventory.vms.length} VMs
              </span>
            )}
          </div>

          {inventory && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 8 }}>Datastore</div>
              <select
                value={selectedDs}
                onChange={(e) => loadDatastore(inventory, e.target.value)}
                className="font-num"
                style={{ width: "100%", padding: "12px 14px", borderRadius: 12, fontSize: 14, fontWeight: 700, background: "var(--bg-input)", border: "1.5px solid var(--border-2)", color: "var(--gold)", cursor: "pointer", outline: "none" }}
              >
                {inventory.datastores.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <TextInput label="Datastore Name" value={ctx.name} onChange={(v) => setCtx({ ...ctx, name: v })} placeholder="DS-PROD-CLUS03-LUN07" />
          <div style={{ height: 12 }} />
          <Field label="Total Capacity" num="1" value={ctx.capacity.v} onChange={(v) => setCtx({ ...ctx, capacity: { v, u: ctx.capacity.u } })} unit={ctx.capacity.u} onUnit={(u) => setCtx({ ...ctx, capacity: { v: ctx.capacity.v, u } })} />
          <Field label="Current Free Space" num="2" value={ctx.free.v} onChange={(v) => setCtx({ ...ctx, free: { v, u: ctx.free.u } })} unit={ctx.free.u} onUnit={(u) => setCtx({ ...ctx, free: { v: ctx.free.v, u } })} />
          <Field label="Safety Buffer" num="3" value={ctx.buffer} onChange={(v) => setCtx({ ...ctx, buffer: v })} showUnit={false} suffix="× multiplier" step="0.05" />
        </Card>

        <Card title="Write-Rate Defaults" sub="Applied to imported and newly added VMs" accent="var(--blue)" delay={0.05}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Daily Change" num="A" hint="% of provisioned per day" value={changePct} onChange={setChangePct} showUnit={false} suffix="%/day" step="0.5" />
            <Field label="Retention" num="B" hint="Snapshot age target" value={retention} onChange={setRetention} showUnit={false} suffix="days" step="1" />
          </div>
          {vms.length > 0 && (
            <button onClick={applyDefaultsToAll} style={btnStyle("ghost")}>
              Apply defaults to all {vms.length} VMs
            </button>
          )}
        </Card>

        <Card title={`VM Roster — ${vms.length}`} sub="Each VM's delta is capped at its own provisioned size" accent="var(--amber)" delay={0.1}>
          {/* add form */}
          <div className="flex" style={{ gap: 8, marginBottom: 14 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addVM()}
              placeholder="VM name"
              aria-label="New VM name"
              className="font-num"
              style={{ flex: 1, minWidth: 0, padding: "11px 14px", borderRadius: 11, fontSize: 13.5, fontWeight: 600, background: "var(--bg-input)", border: "1.5px solid var(--border-2)", color: "var(--text-0)", outline: "none" }}
            />
            <input
              type="number"
              value={newProv}
              onChange={(e) => setNewProv(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addVM()}
              placeholder="GB"
              aria-label="Provisioned GB"
              className="font-num"
              style={{ width: 84, padding: "11px 12px", borderRadius: 11, fontSize: 13.5, fontWeight: 600, background: "var(--bg-input)", border: "1.5px solid var(--border-2)", color: "var(--text-0)", outline: "none" }}
            />
            <button onClick={addVM} aria-label="Add VM" style={{ ...btnStyle("solid"), padding: "11px 14px" }}>
              <Plus size={15} />
            </button>
          </div>

          {vms.length > 0 && (
            <div style={{ overflowX: "auto", margin: "0 -6px", padding: "0 6px" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    {["VM", "Prov GB", "RAM", "Wr/d", "Ret", "Mem", "Δ GB", ""].map((h, i) => (
                      <th key={i} style={{ textAlign: i === 0 ? "left" : "right", fontSize: 9, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-4)", padding: "6px 7px", borderBottom: "1px solid var(--border-2)", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {computed.map((v) => (
                    <tr key={v.id} style={{ borderBottom: "1px solid var(--border-1)" }}>
                      <td style={{ padding: "6px 7px", maxWidth: 140 }}>
                        <div className="font-num" style={{ fontSize: 12, fontWeight: 700, color: "var(--text-0)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={v.name}>
                          {v.name}
                        </div>
                        <div className="flex" style={{ gap: 4, marginTop: 3 }}>
                          {v.spans > 1 && (
                            <Flag title={`Spans ${v.spans} datastores`} color="var(--blue)">
                              <Network size={9} />×{v.spans}
                            </Flag>
                          )}
                          {v.guardrails.some((g) => g.level === "danger") && (
                            <Flag title={v.guardrails.map((g) => g.msg).join(" · ")} color="var(--red)">
                              <AlertTriangle size={9} />
                            </Flag>
                          )}
                          {v.guardrails.length > 0 && !v.guardrails.some((g) => g.level === "danger") && (
                            <Flag title={v.guardrails.map((g) => g.msg).join(" · ")} color="var(--amber)">
                              <AlertTriangle size={9} />
                            </Flag>
                          )}
                        </div>
                      </td>
                      <td style={tdC}><Num value={v.provisionedGB} onChange={(n) => patchVM(v.id, { provisionedGB: n })} /></td>
                      <td style={tdC}><Num value={v.ramGB} onChange={(n) => patchVM(v.id, { ramGB: n })} /></td>
                      <td style={tdC}><Num value={v.writeGBDaily} onChange={(n) => patchVM(v.id, { writeGBDaily: n })} step="0.1" /></td>
                      <td style={tdC}><Num value={v.retentionDays} onChange={(n) => patchVM(v.id, { retentionDays: Math.round(n) })} w={48} /></td>
                      <td style={{ ...tdC, width: 34 }}>
                        <button
                          onClick={() => patchVM(v.id, { memSnap: !v.memSnap })}
                          aria-label={`Memory snapshot for ${v.name}`}
                          style={{ width: 18, height: 18, borderRadius: 5, cursor: "pointer", border: `1.5px solid ${v.memSnap ? "var(--gold)" : "var(--border-2)"}`, background: v.memSnap ? "var(--gold)" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#111", fontSize: 11, fontWeight: 900 }}
                        >
                          {v.memSnap ? "✓" : ""}
                        </button>
                      </td>
                      <td className="font-num" style={{ ...tdC, width: 66, color: v.capped ? "var(--amber)" : "var(--text-1)" }} title={v.capped ? `Capped — uncapped growth ${fmt(v.deltaRawGB, 2)} GB` : undefined}>
                        {fmt(v.deltaGB, 2)}
                      </td>
                      <td style={{ ...tdC, width: 30 }}>
                        <button onClick={() => removeVM(v.id)} aria-label={`Remove ${v.name}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", padding: 4 }}>
                          <X size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ padding: "8px 7px", fontSize: 9.5, fontWeight: 800, letterSpacing: "1px", color: "var(--text-4)" }}>Σ TOTALS</td>
                    <td className="font-num" style={tdFoot}>{fmt(computed.reduce((s, v) => s + v.provisionedGB, 0), 1)}</td>
                    <td className="font-num" style={tdFoot}>{fmt(stats.ramTotalGB, 1)}</td>
                    <td className="font-num" style={tdFoot}>{fmt(stats.dailyTotalGB, 2)}</td>
                    <td colSpan={2} />
                    <td className="font-num" style={{ ...tdFoot, color: "var(--gold)" }}>{fmt(worst, 2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {vms.length === 0 && (
            <p style={{ fontSize: 13, color: "var(--text-4)", lineHeight: 1.7 }}>
              Add VMs manually above, or import an RVTools export — every VM with a disk on the selected datastore is
              placed on the roster with write rates from your defaults. VMs spanning multiple datastores are flagged.
            </p>
          )}
        </Card>
      </div>

      {/* ════════ RESULTS ════════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-live="polite">
        <AnimatePresence mode="wait">
          {vms.length === 0 ? (
            <motion.div key="ph" exit={{ opacity: 0, scale: 0.96 }}>
              <Card delay={0.1}>
                <div style={{ textAlign: "center", padding: "72px 20px" }}>
                  <motion.div animate={{ y: [0, -9, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }} style={{ opacity: 0.16, marginBottom: 18 }}>
                    <Layers size={54} style={{ margin: "0 auto", color: "var(--gold)" }} />
                  </motion.div>
                  <p style={{ fontSize: 16.5, fontWeight: 600, color: "var(--text-3)" }}>Roster is empty</p>
                  <p style={{ fontSize: 13.5, color: "var(--text-4)", marginTop: 8 }}>
                    The planner computes peak snapshot demand, a staggered schedule, and the capacity the storage team must provision
                  </p>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Card title="Peak Snapshot Demand" sub="How many VMs may hold snapshots simultaneously" accent="var(--purple)" delay={0}>
                <div className="flex" style={{ gap: 8, marginBottom: 16 }}>
                  {(
                    [
                      { id: "worst", l: "Worst case — all together" },
                      { id: "staggered", l: "Staggered schedule" },
                    ] as { id: Mode; l: string }[]
                  ).map((m) => {
                    const a = mode === m.id;
                    return (
                      <motion.button
                        key={m.id}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setMode(m.id)}
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 12,
                          border: `1.5px solid ${a ? "var(--maroon)" : "var(--border-1)"}`,
                          fontSize: 13,
                          fontWeight: a ? 700 : 500,
                          cursor: "pointer",
                          background: a ? "var(--maroon-bg)" : "var(--bg-input)",
                          color: a ? "var(--gold)" : "var(--text-3)",
                          transition: "all .2s",
                        }}
                      >
                        {m.l}
                      </motion.button>
                    );
                  })}
                </div>

                {mode === "staggered" && (
                  <div className="flex items-center justify-between" style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 11, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>Max concurrent snapshots</span>
                    <div className="flex items-center" style={{ gap: 10 }}>
                      <button onClick={() => setMaxConcurrent((n) => Math.max(1, n - 1))} aria-label="Fewer concurrent" style={stepBtn}><Minus size={13} /></button>
                      <span className="font-num" style={{ fontSize: 17, fontWeight: 800, color: "var(--gold)", minWidth: 22, textAlign: "center" }}>{Math.min(maxConcurrent, Math.max(vms.length, 1))}</span>
                      <button onClick={() => setMaxConcurrent((n) => Math.min(Math.max(vms.length, 1), n + 1))} aria-label="More concurrent" style={stepBtn}><Plus size={13} /></button>
                    </div>
                  </div>
                )}

                <BigResult
                  label={mode === "worst" ? "Peak demand — worst case" : "Peak demand — largest window"}
                  value={`${fmt(peak, 2)} GB`}
                  sub={
                    mode === "worst"
                      ? `Σ of all ${vms.length} VM deltas (capped per provisioned size)`
                      : `${windows.length} windows · Σ worst-case ${fmt(worst, 2)} GB · commit between windows`
                  }
                />

                {mode === "staggered" && (
                  <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    {windows.map((w) => {
                      const isPeak = w.demandGB === Math.max(...windows.map((x) => x.demandGB));
                      return (
                        <div
                          key={w.label}
                          style={{
                            padding: "11px 14px",
                            borderRadius: 11,
                            background: isPeak ? "var(--gold-bg)" : "var(--bg-input)",
                            border: `1px solid ${isPeak ? "var(--gold-border)" : "var(--border-1)"}`,
                          }}
                        >
                          <div className="flex items-center justify-between" style={{ gap: 10 }}>
                            <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", color: isPeak ? "var(--gold)" : "var(--text-2)" }}>
                              {w.label}
                              {isPeak && <span style={{ marginLeft: 8, fontSize: 9.5 }}>◆ PEAK</span>}
                            </span>
                            <span className="font-num" style={{ fontSize: 13, fontWeight: 800, color: isPeak ? "var(--gold)" : "var(--text-1)" }}>{fmt(w.demandGB, 2)} GB</span>
                          </div>
                          <p className="font-num" style={{ fontSize: 11, color: "var(--text-4)", marginTop: 5, lineHeight: 1.7, wordBreak: "break-word" }}>{w.vmNames.join(" · ")}</p>
                        </div>
                      );
                    })}
                    <p style={{ fontSize: 11.5, color: "var(--text-4)", lineHeight: 1.7 }}>
                      Assumption: each window's snapshots are committed before the next window opens — peak exposure never exceeds the largest window.
                    </p>
                  </div>
                )}
              </Card>

              {health && (
                <Card
                  title="Capacity & Authorization"
                  sub="(Used + ΣRAM + peak demand) × buffer, against policy"
                  accent={health.sev === "success" ? "var(--green)" : health.sev === "warning" ? "var(--amber)" : "var(--red)"}
                  delay={0.06}
                >
                  <Row label="Used (capacity − free)" value={`${fmt(stats.usedGB, 1)} GB`} />
                  <Row label="Σ VM RAM" value={`${fmt(stats.ramTotalGB, 1)} GB`} />
                  <Row label={`Peak demand (${mode === "worst" ? "worst case" : `staggered ×${maxConcurrent}`})`} value={`${fmt(peak, 2)} GB`} gold />
                  <Row label={`Safety Buffer (+${fmt((buffer - 1) * 100, 0)}%)`} value={`+${fmt(stats.requiredGB - stats.usedGB - stats.ramTotalGB - peak, 1)} GB`} />
                  <BigResult label="Required Datastore Capacity" value={`${fmt(stats.requiredGB, 2)} GB`} sub={`${fmt(stats.requiredGB / 1024, 3)} TB`} />

                  <div style={{ marginTop: 20 }}>
                    <StatusPanel sev={health.sev} title={`STATUS: ${health.status}`} detail={health.msg} />
                  </div>

                  <SectionLabel>
                    <span style={{ marginTop: 18, display: "inline-block", marginBottom: 0 }}>Projected free at planned peak</span>
                  </SectionLabel>
                  <Progress
                    pct={Math.max(health.projectedFreePct, 0)}
                    sev={projSev}
                    markerPct={POLICY.freeSpace.approvedPct}
                    showMarkerLabel
                    left={`Projected: ${fmt(health.projectedFreeGB, 2)} GB (${health.projectedFreePct}%)`}
                    right={`Peak: ${fmt(peak, 2)} GB`}
                  />

                  <div style={{ marginTop: 20 }}>
                    <StatusPanel
                      sev={health.snapAuthorized ? "success" : "danger"}
                      title={health.snapAuthorized ? `AUTHORIZED — ${health.projectedFreePct}% free at peak` : "DENIED — peak consumption breaches policy"}
                      detail={
                        health.snapAuthorized
                          ? "Planned peak keeps the datastore above policy thresholds. Proceed under change management."
                          : "Reduce concurrency, shorten retention, or expand capacity before executing this snapshot plan."
                      }
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 20 }}>
                    <div style={{ padding: 14, borderRadius: 11, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 5 }}>Peak-safe runway</div>
                      <div className="font-num" style={{ fontSize: 17, fontWeight: 800, color: runway === null ? "var(--text-4)" : runway < 0 ? "var(--red)" : runway < 7 ? "var(--amber)" : "var(--green)" }}>
                        {runway === null ? "—" : runway < 0 ? "BREACHED" : `≈ ${Math.floor(runway)} days`}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 4, lineHeight: 1.5 }}>
                        at {fmt(stats.dailyTotalGB, 2)} GB/day aggregate writes
                      </div>
                    </div>
                    <div style={{ padding: 14, borderRadius: 11, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
                      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 5 }}>Expansion</div>
                      <div className="font-num" style={{ fontSize: 17, fontWeight: 800, color: health.sufficient ? "var(--green)" : "var(--red)" }}>
                        {health.sufficient ? "Not needed" : `+${fmt(health.gapGB, 2)} GB`}
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--text-4)", marginTop: 4, lineHeight: 1.5 }}>
                        {health.sufficient ? "capacity covers the plan" : "to execute this plan safely"}
                      </div>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.015, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => void doExport()}
                    disabled={exporting}
                    style={{
                      width: "100%",
                      padding: 15,
                      borderRadius: 14,
                      marginTop: 20,
                      cursor: exporting ? "wait" : "pointer",
                      border: "1.5px solid var(--gold-border)",
                      fontSize: 14,
                      fontWeight: 800,
                      letterSpacing: "1px",
                      background: "linear-gradient(135deg, var(--gold-bg), var(--maroon-bg))",
                      color: "var(--gold)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                    }}
                  >
                    <FileDown size={17} />
                    {exporting ? "GENERATING…" : "EXPORT SNAPSHOT PLAN (XLSX)"}
                  </motion.button>
                  <p className="font-num" style={{ marginTop: 12, fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.4px" }}>
                    Plan + VM delta analysis + schedule + guardrails · reference-numbered · {APP.formulaVersion} · {APP.classification}
                  </p>
                </Card>
              )}

              {flagged.length > 0 && (
                <Card title={`Guardrails — ${flagged.length} flagged`} accent="var(--red)" delay={0.1}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {flagged.flatMap((v) =>
                      v.guardrails.map((g, i) => (
                        <div key={`${v.id}-${i}`} className="flex items-start" style={{ gap: 9, padding: "9px 13px", borderRadius: 10, background: g.level === "danger" ? "var(--red-bg)" : "var(--amber-bg)", border: `1px solid ${g.level === "danger" ? "rgba(239,68,68,0.3)" : "rgba(245,158,11,0.3)"}` }}>
                          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2, color: g.level === "danger" ? "var(--red)" : "var(--amber)" }} />
                          <span style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--text-2)" }}>
                            <strong className="font-num" style={{ color: "var(--text-0)" }}>{v.name}</strong> — {g.msg}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </Card>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── local bits ─────────────────────────────────────────────── */

const tdC: React.CSSProperties = { padding: "6px 7px", textAlign: "right" };
const tdFoot: React.CSSProperties = { padding: "8px 7px", textAlign: "right", fontSize: 12, fontWeight: 800, color: "var(--text-1)" };
const stepBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8, cursor: "pointer",
  border: "1.5px solid var(--border-2)", background: "var(--bg-card)", color: "var(--gold)",
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

function Num({ value, onChange, w = 62, step = "any" }: { value: number; onChange: (n: number) => void; w?: number; step?: string }) {
  return (
    <input
      type="number"
      value={+value.toFixed(4)}
      step={step}
      min="0"
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="font-num"
      style={{
        width: w,
        padding: "6px 8px",
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 700,
        textAlign: "right",
        background: "var(--bg-input)",
        border: "1px solid var(--border-2)",
        color: "var(--text-0)",
        outline: "none",
      }}
    />
  );
}

function Flag({ color, title, children }: { color: string; title: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className="inline-flex items-center"
      style={{ gap: 3, fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 5, color, background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 35%, transparent)` }}
    >
      {children}
    </span>
  );
}

function TextInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 8 }}>{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="font-num"
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 12,
          fontSize: 14,
          fontWeight: 600,
          outline: "none",
          background: "var(--bg-input)",
          border: "1.5px solid var(--border-2)",
          color: "var(--text-0)",
        }}
      />
    </div>
  );
}

function btnStyle(kind: "solid" | "ghost"): React.CSSProperties {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "10px 16px",
    borderRadius: 11,
    fontSize: 12.5,
    fontWeight: 800,
    letterSpacing: "0.4px",
    cursor: "pointer",
  };
  if (kind === "solid")
    return { ...base, color: "#f3dd9a", background: "linear-gradient(135deg, var(--maroon), var(--maroon-2))", border: "1.5px solid var(--gold-border)" };
  return { ...base, color: "var(--gold)", background: "var(--gold-bg)", border: "1.5px solid var(--gold-border)" };
}
