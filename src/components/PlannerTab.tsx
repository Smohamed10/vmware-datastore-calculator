/**
 * TAB 4 — Multi-VM Planner.
 * Per-datastore VM rosters (RVTools or manual), per-VM delta modeling
 * capped at provisioned size, spanning-VM detection, worst-case vs
 * staggered peak planning with a balanced snapshot-window scheduler,
 * peak-safe runway, and an exportable XLSX consolidation plan.
 */
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { CalendarClock, CheckSquare, Download, FileSpreadsheet, Link2, MinusSquare, Plus, Square, Trash2, TriangleAlert, Unlink2 } from "lucide-react";
import { POLICY } from "../config/policy";
import { calcHealth, fmt, num, smartUnit, toGB, type UnitValue } from "../lib/engine";
import { clearPersisted, usePersistentState } from "../lib/persist";
import { parseWorkbookFile, RVTOOLS_PARSER_VERSION } from "../lib/bulk";
import { clearInventory, setInventory, useInventorySlot } from "../lib/inventoryStore";
import {
  computeStats, computeVM, exportPlannerRunbook, peakWorst, rosterForDatastore, runwayDays,
  scheduleWindows, uid, type PlannerVM, type VMComputed,
} from "../lib/planner";
import {
  AnimatedValue, Card, Chip, ClearButton, EmptyState, FieldLabel, GhostButton, InfoBanner, InfoDot,
  LiveBadge, PlainNumInput, SectionLabel, Segmented, SevDot, StatCard, TextField, Th, Td, Tip,
} from "./ui";
import FileDrop from "./FileDrop";

const uv = (v = "", u: UnitValue["u"] = "GB"): UnitValue => ({ v, u });

/** Planning default retention window (days). Rosters and new VMs inherit
 *  this; VMs keep following it live until a row's retention is hand-edited. */
export const DEFAULT_RETENTION_DAYS = 7;

const DEFAULTS = {
  dsName: "", cap: uv("2048"), free: uv("1024"), buffer: String(POLICY.safetyBuffer),
  changePct: "2", retentionDays: String(DEFAULT_RETENTION_DAYS),
  mode: "staggered" as "worst" | "staggered", maxConcurrent: "3",
  vms: [] as PlannerVM[], retOverrides: [] as string[],
};

export default function PlannerTab() {
  const [dsName, setDsName] = usePersistentState("plan.dsName", DEFAULTS.dsName);
  const [cap, setCap] = usePersistentState<UnitValue>("plan.cap", DEFAULTS.cap);
  const [free, setFree] = usePersistentState<UnitValue>("plan.free", DEFAULTS.free);
  const [buffer, setBuffer] = usePersistentState("plan.buffer", DEFAULTS.buffer);
  const [changePct, setChangePct] = usePersistentState("plan.changePct", DEFAULTS.changePct);
  const [retentionDays, setRetentionDays] = usePersistentState("plan.retentionDays", DEFAULTS.retentionDays);
  const [mode, setMode] = usePersistentState<"worst" | "staggered">("plan.mode", DEFAULTS.mode);
  const [maxConcurrent, setMaxConcurrent] = usePersistentState("plan.maxConcurrent", DEFAULTS.maxConcurrent);
  const [vms, setVms] = usePersistentState<PlannerVM[]>("plan.vms", DEFAULTS.vms);
  /** VM ids whose retention was hand-edited — these stop following the
   *  planning default so a per-VM decision is never silently overwritten. */
  const [retOverrides, setRetOverrides] = usePersistentState<string[]>("plan.retOverrides", DEFAULTS.retOverrides);

  /* Inventory lives in the session-scoped store, so switching tabs and
     coming back keeps the workbook loaded. The selected datastore is
     persisted so the roster context is restated even after a refresh. */
  const slot = useInventorySlot("planner");
  const inv = slot?.inventory ?? null;
  const [rvDs, setRvDs] = usePersistentState("plan.rvDs", "");
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  /* heal comma-formatted strings persisted by older builds */
  useEffect(() => {
    setCap((p) => (p.v.includes(",") ? { ...p, v: p.v.replace(/,/g, "") } : p));
    setFree((p) => (p.v.includes(",") ? { ...p, v: p.v.replace(/,/g, "") } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── derived model ── */
  const capGB = toGB(cap.v, cap.u);
  const freeGB = toGB(free.v, free.u);
  const bufferX = Math.max(1, parseFloat(buffer) || POLICY.safetyBuffer);
  const k = Math.max(1, Math.floor(parseFloat(maxConcurrent) || 1));

  const computed: VMComputed[] = useMemo(() => vms.map((v) => computeVM(v)), [vms]);
  const windows = useMemo(
    () => (mode === "staggered" ? scheduleWindows(computed.map((v) => ({ name: v.name, totalGB: v.totalGB })), k) : []),
    [mode, computed, k]
  );
  const peakGB = mode === "worst" ? peakWorst(computed) : windows.length > 0 ? Math.max(...windows.map((w) => w.demandGB)) : 0;
  const stats = useMemo(() => computeStats(capGB, freeGB, computed, peakGB, bufferX), [capGB, freeGB, computed, peakGB, bufferX]);
  const health = useMemo(() => (capGB > 0 ? calcHealth(capGB, freeGB, stats.requiredGB, peakGB) : null), [capGB, freeGB, stats, peakGB]);
  const runway = runwayDays(freeGB, peakGB, stats.dailyTotalGB);
  const hasVms = computed.length > 0;

  /* ── Required datastore increase (fully dynamic) ──
     Recomputes from every live input — roster, retention, memory-state
     choices, planning mode, concurrency, buffer, capacity and free space.
     Two independent demands, whichever bites harder:
       a) sizing gap  — required capacity vs. what the datastore has
       b) peak floor  — free space must still clear the policy minimum
                        AFTER the peak snapshot demand lands             */
  const expansion = useMemo(() => {
    if (capGB <= 0) return { gb: 0, driver: "none" as "none" | "sizing" | "peak" };
    const sizingGap = Math.max(0, stats.requiredGB - capGB);
    const peakFloorGap = Math.max(0, peakGB + (POLICY.freeSpace.warningPct / 100) * capGB - freeGB);
    const gb = Math.max(sizingGap, peakFloorGap);
    return {
      gb,
      driver: gb <= 0 ? ("none" as const) : peakFloorGap >= sizingGap ? ("peak" as const) : ("sizing" as const),
      sizingGap,
      peakFloorGap,
    };
  }, [capGB, freeGB, stats.requiredGB, peakGB]);
  const expansionCeil = Math.ceil(expansion.gb);

  /* ── live retention propagation ──
     Typing in the planning-default field updates every VM that still
     follows it, on each keystroke. Hand-edited rows are left alone. */
  const retentionNum = Math.max(1, Math.round(parseFloat(retentionDays) || 0) || 0);
  useEffect(() => {
    if (!(retentionNum >= 1)) return;
    setVms((prev) => {
      let touched = false;
      const next = prev.map((v) => {
        if (retOverrides.includes(v.id) || v.retentionDays === retentionNum) return v;
        touched = true;
        return { ...v, retentionDays: retentionNum };
      });
      return touched ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retentionNum, retOverrides]);

  const followers = vms.filter((v) => !retOverrides.includes(v.id)).length;
  const memOn = vms.filter((v) => v.memSnap).length;
  const allMem = vms.length > 0 && memOn === vms.length;

  /* ── roster actions ── */
  const patchVm = (id: string, patch: Partial<PlannerVM>) =>
    setVms((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));

  /** Bulk memory-state toggle — flips every VM in one action. */
  function setAllMem(on: boolean) {
    setVms((prev) => prev.map((v) => ({ ...v, memSnap: on })));
    toast.success(on ? `Memory state captured for all ${vms.length} VMs` : "Memory state cleared for all VMs");
  }

  function releaseRetention(id: string) {
    setRetOverrides((prev) => prev.filter((x) => x !== id));
  }

  function addVm() {
    setVms((prev) => [
      ...prev,
      { id: uid(), name: `VM-${String(prev.length + 1).padStart(2, "0")}`, provisionedGB: 100, ramGB: 16, writeGBDaily: 5, retentionDays: retentionNum || DEFAULT_RETENTION_DAYS, memSnap: false, spans: 1 },
    ]);
  }

  async function importRv(file: File) {
    setBusy(true);
    try {
      const outcome = await parseWorkbookFile(file);
      if (!outcome.inventory) {
        toast.error("That file is a template — the planner needs a full RVTools export with vDisk rows.");
        return;
      }
      setInventory("planner", {
        inventory: outcome.inventory,
        fileName: file.name,
        source: outcome.source,
        loadedAt: Date.now(),
      });
      setRvDs("");
      toast.success(`RVTools loaded — ${outcome.inventory.vms.length} VMs across ${outcome.inventory.datastores.length} datastores`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse that workbook.");
    } finally {
      setBusy(false);
    }
  }

  function buildRoster(name: string) {
    setRvDs(name);
    const ds = inv?.datastores.find((d) => d.name === name);
    if (ds) {
      setDsName(ds.name);
      setCap(uv(num(ds.capacityGB, 2)));
      setFree(uv(num(ds.freeGB, 2)));
    }
    const roster = rosterForDatastore(inv!, name, {
      changePct: parseFloat(changePct) || 0,
      retentionDays: retentionNum || DEFAULT_RETENTION_DAYS,
    });
    setVms(roster);
    setRetOverrides([]); // fresh roster follows the planning default again
    toast.success(`Roster built — ${roster.length} VMs on ${name}`);
  }

  function clearAll() {
    clearPersisted("plan.");
    setDsName(DEFAULTS.dsName); setCap(DEFAULTS.cap); setFree(DEFAULTS.free);
    setBuffer(DEFAULTS.buffer); setChangePct(DEFAULTS.changePct); setRetentionDays(DEFAULTS.retentionDays);
    setMode(DEFAULTS.mode); setMaxConcurrent(DEFAULTS.maxConcurrent); setVms([]);
    setRetOverrides([]);
    clearInventory("planner"); setRvDs("");
    toast.success("Planner cleared — roster and saved values wiped");
  }

  async function exportRunbook() {
    if (!health) return;
    setExporting(true);
    try {
      const ref = await exportPlannerRunbook(
        {
          datastore: dsName, capacityGB: capGB, freeGB, buffer: bufferX, mode, maxConcurrent: k,
          stats, projectedFreePct: health.projectedFreePct, authorized: health.snapAuthorized, status: health.status,
          expansionGB: expansion.gb, expansionDriver: expansion.driver,
        },
        computed,
        windows
      );
      toast.success(`Consolidation plan exported — ${ref}`);
    } catch {
      toast.error("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const spanCount = computed.filter((v) => v.spans > 1).length;
  const flagged = computed.filter((v) => v.guardrails.length > 0).length;
  const maxWindowDemand = windows.length > 0 ? Math.max(...windows.map((w) => w.demandGB)) : 0;

  return (
    <div className="mx-auto" style={{ maxWidth: 1500, padding: "24px 20px 8px" }}>
      <div className="grid items-start" style={{ gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
        {/* ── left: context + strategy ── */}
        <div className="flex flex-col" style={{ gap: 16 }}>
          <Card title="Datastore context" right={<ClearButton onClick={clearAll} />}>
            <TextField
              label="Datastore name" value={dsName} onChange={setDsName} placeholder="DS-PROD-01"
              tip="Datastore whose VMs the roster models. Echoed onto the exported consolidation plan."
            />
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <ContextNum label="Capacity" tip="Total provisioned capacity of this datastore." value={cap} onChange={setCap} />
              <ContextNum label="Free space" tip={`Free space right now. Governance floors: ${POLICY.freeSpace.approvedPct}% (approved) and ${POLICY.freeSpace.warningPct}% (minimum at peak).`} value={free} onChange={setFree} />
            </div>
            <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 10 }}>
              <Chip tip="Derived live: Capacity − Free. Health and required-capacity figures recompute the moment either field changes.">
                used {fmt(Math.max(capGB - freeGB, 0), 1)} GB
              </Chip>
              <Chip
                tone={freeGB >= capGB * 0.25 ? "success" : freeGB >= capGB * 0.15 ? "warning" : "danger"}
                tip={`Free share of capacity against the governance floor (${POLICY.freeSpace.approvedPct}% approved, ${POLICY.freeSpace.warningPct}% minimum).`}
              >
                {capGB > 0 ? fmt((freeGB / capGB) * 100, 1) : "—"}% free
              </Chip>
            </div>

            <SectionLabel>From RVTools (optional)</SectionLabel>
            {!inv ? (
              <FileDrop onFile={importRv} busy={busy} compact label="Drop an RVTools export to auto-build the roster" note="vDatastore sizes the context; vDisk + vInfo build the VM roster with real provisioned sizes and RAM." />
            ) : (
              <div className="rounded-xl" style={{ padding: 13, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
                <div className="flex items-center justify-between flex-wrap" style={{ gap: 8 }}>
                  <span className="font-num inline-flex items-center" style={{ gap: 8, fontSize: 12, color: "var(--text-1)", fontWeight: 700, minWidth: 0 }}>
                    <FileSpreadsheet size={14} style={{ color: "var(--gold)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }}>
                      {slot?.fileName ?? "inventory loaded"}
                    </span>
                  </span>
                  <div className="flex items-center" style={{ gap: 6 }}>
                    <Chip tone="gold" tip="Parser build that read this inventory.">{RVTOOLS_PARSER_VERSION}</Chip>
                    {rvDs && (
                      <GhostButton
                        label="Rebuild"
                        title="Re-derive the roster from the inventory with the current change-rate and retention settings"
                        onClick={() => buildRoster(rvDs)}
                      />
                    )}
                    <GhostButton label="Replace" onClick={() => { clearInventory("planner"); setRvDs(""); }} />
                  </div>
                </div>
                <div style={{ marginTop: 11 }}>
                  <FieldLabel tip="Daily write assumption used when deriving VM write rates from provisioned size: write/day = change% × provisioned. Typical steady-state estimates sit between 1% and 5%.">
                    Change-rate assumption: {changePct}%/day — then pick a datastore
                  </FieldLabel>
                  <div className="flex" style={{ gap: 8 }}>
                    {["1", "2", "5"].map((p) => (
                      <button key={p} type="button" onClick={() => setChangePct(p)} className="font-num"
                        style={{
                          flex: 1, padding: "7px 0", borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800,
                          color: changePct === p ? "#f3dd9a" : "var(--text-3)",
                          background: changePct === p ? "var(--maroon)" : "var(--bg-2)",
                          border: `1px solid ${changePct === p ? "var(--gold-border)" : "var(--border-2)"}`,
                        }}>
                        {p}%
                      </button>
                    ))}
                  </div>
                  <select
                    value={rvDs}
                    onChange={(e) => e.target.value && buildRoster(e.target.value)}
                    className="font-num"
                    style={{
                      width: "100%", marginTop: 9, background: "var(--bg-2)", border: "1px solid var(--border-2)", borderRadius: 11,
                      padding: "10px 12px", fontSize: 13, color: "var(--text-1)", cursor: "pointer", outline: "none",
                    }}
                    aria-label="Build roster from datastore"
                  >
                    <option value="">— build roster for… —</option>
                    {inv.datastores.map((d) => (
                      <option key={d.name} value={d.name}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </Card>

          <Card title="Planning strategy">
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "worst", label: "Worst case — all together" },
                { value: "staggered", label: "Staggered windows" },
              ]}
            />
            <p style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 9, lineHeight: 1.55 }}>
              {mode === "worst"
                ? "Every VM snapshots simultaneously: peak = Σ deltas + Σ memory states. The conservative ceiling."
                : "Snapshots are balanced into windows of at most k concurrent VMs (LPT scheduling): peak = the largest window. Cheaper, operationally disciplined."}
            </p>
            {mode === "staggered" && (
              <div style={{ marginTop: 12 }}>
                <FieldLabel tip="Maximum snapshots allowed open at once. Windows keep each slot ≤ this cap while balancing demand across windows (LPT greedy — largest delta first).">
                  Max concurrent snapshots: {k}
                </FieldLabel>
                <div className="flex items-center" style={{ gap: 8 }}>
                  {[1, 2, 3, 5, 8].map((n) => (
                    <button key={n} type="button" onClick={() => setMaxConcurrent(String(n))} className="font-num"
                      style={{
                        flex: 1, padding: "7px 0", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 800,
                        color: k === n ? "#f3dd9a" : "var(--text-3)",
                        background: k === n ? "var(--maroon)" : "var(--bg-input)",
                        border: `1px solid ${k === n ? "var(--gold-border)" : "var(--border-2)"}`,
                      }}>
                      {n}
                    </button>
                  ))}
                  <input
                    type="number" min={1} step={1} value={maxConcurrent} onChange={(e) => setMaxConcurrent(e.target.value)} aria-label="Custom concurrency"
                    className="font-num"
                    style={{
                      width: 70, background: "var(--bg-input)", border: "1px solid var(--border-2)", borderRadius: 9,
                      padding: "7px 10px", fontSize: 12, color: "var(--text-1)", outline: "none", textAlign: "center",
                    }}
                  />
                </div>
              </div>
            )}
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <div>
                <FieldLabel
                  tip={`Planning retention window, default ${DEFAULT_RETENTION_DAYS} days. Every roster VM that hasn't been hand-edited follows this value live — type here and the VM retention cells, deltas, peak demand and verdict all update instantly. Operational guideline for a single chain is ≤ ${POLICY.maxSnapshotAgeDays}d.`}
                >
                  Default retention (days) <InfoDot />
                </FieldLabel>
                <PlainNumInput value={retentionDays} onChange={setRetentionDays} step={1} />
                <div className="flex items-center flex-wrap" style={{ gap: 6, marginTop: 7 }}>
                  {[1, 3, 7, 14].map((d) => (
                    <button
                      key={d} type="button" onClick={() => setRetentionDays(String(d))}
                      className="font-num"
                      style={{
                        flex: 1, padding: "5px 0", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 800,
                        color: retentionDays === String(d) ? "#f3dd9a" : "var(--text-3)",
                        background: retentionDays === String(d) ? "var(--maroon)" : "var(--bg-input)",
                        border: `1px solid ${retentionDays === String(d) ? "var(--gold-border)" : "var(--border-2)"}`,
                      }}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
                {hasVms && (
                  <motion.div
                    key={`${followers}-${retentionNum}`}
                    initial={{ opacity: 0, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: 7 }}
                  >
                    <Chip
                      tone={followers > 0 ? "success" : "neutral"}
                      tip={
                        followers > 0
                          ? `${followers} of ${vms.length} VMs mirror this value as you type. Editing a VM's own retention cell detaches just that row.`
                          : "Every VM has a hand-edited retention. Use “reset all” to make them follow the planning default again."
                      }
                    >
                      {followers > 0 ? `${followers}/${vms.length} VMs follow live` : "all rows detached"}
                    </Chip>
                    {followers < vms.length && (
                      <button
                        type="button"
                        onClick={() => { setRetOverrides([]); toast.success("All VMs follow the planning retention again"); }}
                        className="font-num"
                        style={{ marginLeft: 8, background: "none", border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 800, color: "var(--gold)", letterSpacing: "0.5px" }}
                      >
                        RESET ALL
                      </button>
                    )}
                  </motion.div>
                )}
              </div>
              <div>
                <FieldLabel tip={`Safety buffer multiplier on (used + RAM + peak). Policy default ${POLICY.safetyBuffer}×.`}>
                  Safety buffer
                </FieldLabel>
                <PlainNumInput value={buffer} onChange={setBuffer} step={0.05} />
              </div>
            </div>
          </Card>
        </div>

        {/* ── right: roster + results ── */}
        <div className="flex flex-col" style={{ gap: 16 }}>
          <Card
            title="VM roster"
            sub={hasVms ? `${computed.length} VMs · ${fmt(stats.dailyTotalGB, 2)} GB/day aggregate writes · retention ${retentionNum}d default` : "Add VMs manually or build the roster from an RVTools export."}
            right={
              <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
                {hasVms && (
                  <Tip
                    title="Memory state — all VMs"
                    tip={`Capture live memory (.vmsn) for every VM at once instead of ticking each row. Adds ~RAM + ${fmt(POLICY.memoryStateOverheadGB * 1024, 0)} MB per VM — currently ${memOn} of ${vms.length} enabled, worth ${fmt(stats.memTotalGB, 1)} GB of peak demand.`}
                  >
                    <button
                      type="button"
                      onClick={() => setAllMem(!allMem)}
                      className="inline-flex items-center font-num"
                      style={{
                        gap: 8, padding: "8px 13px", borderRadius: 11, cursor: "pointer",
                        fontSize: 11, fontWeight: 800, letterSpacing: "0.5px",
                        color: allMem ? "#f3dd9a" : "var(--text-2)",
                        background: allMem ? "var(--maroon)" : "var(--bg-input)",
                        border: `1px solid ${allMem ? "var(--gold-border)" : "var(--border-2)"}`,
                      }}
                    >
                      <motion.span
                        animate={{ scale: allMem ? [1, 1.25, 1] : 1 }}
                        transition={{ duration: 0.35 }}
                        style={{ display: "inline-flex" }}
                      >
                        {allMem ? <CheckSquare size={14} /> : memOn > 0 ? <MinusSquare size={14} /> : <Square size={14} />}
                      </motion.span>
                      ALL MEMORY
                      <span style={{ opacity: 0.75 }}>{memOn}/{vms.length}</span>
                    </button>
                  </Tip>
                )}
                <GhostButton onClick={addVm} icon={<Plus size={14} />} label="Add VM" title="Append a blank VM row to the roster" />
              </div>
            }
          >
            {!hasVms ? (
              <EmptyState
                icon={<CalendarClock size={28} strokeWidth={1.7} />}
                title="Roster is empty"
                body="Add VMs by hand, or drop an RVTools export in the context card and build the roster with real provisioned sizes, RAM and spanning detection."
              />
            ) : (
              <div style={{ overflowX: "auto", margin: "0 -8px" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 880 }}>
                  <thead>
                    <tr>
                      <Th label="VM" tip="Virtual machine name. Spanning VMs (disks on multiple datastores) are flagged — their snapshots grow on every datastore at once." />
                      <Th label="Prov GB" tip="Provisioned disk space on THIS datastore. Deltas are hard-capped at this value." align="right" />
                      <Th label="RAM GB" tip="Guest memory. Reserved when the VM snapshots with memory state." align="right" />
                      <Th label="Write GB/day" tip="Net changed blocks per day. From RVTools rosters this is the change% assumption × provisioned size." align="right" />
                      <Th label="Ret d" tip={`Days this chain will live. Rows follow the planning default (${retentionNum}d) live until you type here, which detaches just that row — click the gold dot to re-follow. Guideline ≤ ${POLICY.maxSnapshotAgeDays}d before guardrails flag it.`} align="right" />
                      <Th label="Mem" tip="Include memory state (.vmsn) in this VM's snapshot: costs ~RAM + 100 MB. Use the ALL MEMORY button above to flip every VM at once." align="center" />
                      <Th label="Delta" tip="delta = write × retention × safety factor, capped at provisioned size." align="right" />
                      <Th label="Total" tip="Delta + memory state — the demand this VM adds at snapshot peak." align="right" />
                      <Th label="Spans" tip="Number of distinct datastores holding this VM's disks. >1 means the snapshot grows everywhere simultaneously." align="center" />
                      <Th label="" />
                    </tr>
                  </thead>
                  <tbody>
                    {computed.map((v) => (
                      <tr key={v.id} style={{ background: "transparent" }}>
                        <Td>
                          <input
                            type="text" value={v.name} onChange={(e) => patchVm(v.id, { name: e.target.value })}
                            style={{
                              background: "var(--bg-input)", border: "1px solid var(--border-2)", borderRadius: 9,
                              padding: "6px 9px", fontSize: 12, color: "var(--text-1)", outline: "none", width: 150, fontWeight: 700,
                            }}
                            aria-label="VM name"
                          />
                        </Td>
                        <Td align="right"><NumCell value={v.provisionedGB} onCommit={(n) => patchVm(v.id, { provisionedGB: n })} /></Td>
                        <Td align="right"><NumCell value={v.ramGB} onCommit={(n) => patchVm(v.id, { ramGB: n })} /></Td>
                        <Td align="right"><NumCell value={v.writeGBDaily} onCommit={(n) => patchVm(v.id, { writeGBDaily: n })} /></Td>
                        <Td align="right">
                          <span className="inline-flex items-center" style={{ gap: 5 }}>
                            {retOverrides.includes(v.id) ? (
                              <Tip tip="This row's retention was hand-edited, so it no longer follows the planning default. Click to re-attach it." title="Detached">
                                <button
                                  type="button"
                                  onClick={() => { releaseRetention(v.id); patchVm(v.id, { retentionDays: retentionNum }); }}
                                  aria-label="Follow planning retention"
                                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 0, color: "var(--gold)" }}
                                >
                                  <Unlink2 size={11} />
                                </button>
                              </Tip>
                            ) : (
                              <Tip tip={`Following the planning default (${retentionNum}d) — it updates live as you type in the strategy card.`} title="Linked">
                                <Link2 size={11} style={{ color: "var(--text-4)" }} />
                              </Tip>
                            )}
                            <NumCell
                              value={v.retentionDays}
                              onCommit={(n) => {
                                const days = Math.max(1, Math.round(n));
                                setRetOverrides((prev) => (prev.includes(v.id) ? prev : [...prev, v.id]));
                                patchVm(v.id, { retentionDays: days });
                              }}
                              warn={v.retentionDays > POLICY.maxSnapshotAgeDays}
                              width={58}
                            />
                          </span>
                        </Td>
                        <Td align="center" mono={false}>
                          <input type="checkbox" checked={v.memSnap} onChange={(e) => patchVm(v.id, { memSnap: e.target.checked })} style={{ accentColor: "var(--maroon)", width: 15, height: 15, cursor: "pointer" }} aria-label="Memory snapshot" />
                        </Td>
                        <Td align="right">
                          <span style={{ color: v.capped ? "var(--red)" : "var(--text-1)", fontWeight: 700 }}>
                            {fmt(v.deltaGB, 1)}
                          </span>
                          {v.capped && (
                            <span className="font-num" style={{ marginLeft: 5, fontSize: 9, fontWeight: 800, color: "var(--red)", letterSpacing: "0.5px" }}>
                              <Tip tip="Raw growth exceeds the provisioned size — estimate clamped at the disk's cap. Treat as a saturation risk." title="Capped">CAP</Tip>
                            </span>
                          )}
                        </Td>
                        <Td align="right"><span style={{ fontWeight: 800, color: "var(--text-0)" }}>{fmt(v.totalGB, 1)}</span></Td>
                        <Td align="center">
                          {v.spans > 1 ? (
                            <Tip tip={`This VM's disks span ${v.spans} datastores — a snapshot grows on all of them at once. Plan it on every datastore it touches.`} title="Spanning VM">
                              <Chip tone="warning">×{v.spans}</Chip>
                            </Tip>
                          ) : (
                            <span style={{ color: "var(--text-4)" }}>·</span>
                          )}
                        </Td>
                        <Td align="center" mono={false}>
                          <button onClick={() => setVms((prev) => prev.filter((x) => x.id !== v.id))} aria-label={`Remove ${v.name}`}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-4)", padding: 4 }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--red)")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-4)")}>
                            <Trash2 size={14} />
                          </button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {flagged > 0 && (
              <div style={{ marginTop: 12 }} className="flex flex-col" >
                {computed.flatMap((v) =>
                  v.guardrails.map((g, gi) => (
                    <div key={`${v.id}-${gi}`} className="flex items-center" style={{ gap: 8, padding: "4px 0" }}>
                      <SevDot sev={g.level === "danger" ? "danger" : "warning"} size={7} />
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>
                        <strong className="font-num" style={{ color: "var(--text-0)" }}>{v.name}</strong> — {g.msg}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>

          {/* plan outcome */}
          {hasVms && health && (
            <>
              <div className="flex justify-end" >
                <LiveBadge />
              </div>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                <StatCard
                  label="Peak demand" value={<AnimatedValue value={peakGB} format={(n) => smartUnit(n)} />} tone="gold"
                  tip={mode === "worst" ? "Σ deltas + Σ memory states — every VM at once." : `Largest scheduled window (LPT-balanced, ≤ ${k} concurrent).`}
                />
                <StatCard label="Required capacity" value={<AnimatedValue value={stats.requiredGB} format={(n) => smartUnit(n)} />} tip="(Used + ΣRAM + peak) × safety buffer — what this datastore should be." />
                <StatCard
                  label="Projected free @peak" value={<AnimatedValue value={health.projectedFreePct} format={(n) => `${fmt(n, 1)}%`} />}
                  tone={health.projectedFreePct >= POLICY.freeSpace.approvedPct ? "success" : health.projectedFreePct >= POLICY.freeSpace.warningPct ? "warning" : "danger"}
                  tip={`(Free − peak) ÷ capacity. Must stay ≥ ${POLICY.freeSpace.warningPct}% for authorization.`}
                />
                <StatCard
                  label="Runway" value={runway === null ? "∞" : <AnimatedValue value={runway} format={(n) => `${fmt(n, 1)} d`} />}
                  tone={runway !== null && runway < 0 ? "danger" : runway !== null && runway < 3 ? "warning" : "success"}
                  tip="Days of uncommitted write growth the datastore absorbs beyond the planned peak before zeroing out. ∞ when no write rate is set."
                />
                <StatCard
                  label="Required increase"
                  value={
                    expansionCeil > 0
                      ? <AnimatedValue value={expansionCeil} format={(n) => `+${Math.ceil(n).toLocaleString("en-US")} GB`} />
                      : "0 GB"
                  }
                  tone={expansionCeil > 0 ? "warning" : "success"}
                  tip={
                    expansionCeil > 0
                      ? `Capacity to add to ${dsName || "this datastore"}, rounded up — the larger of the sizing gap (required ${fmt(stats.requiredGB, 1)} GB − capacity ${fmt(capGB, 1)} GB) and the peak floor gap (peak ${fmt(peakGB, 1)} GB + ${POLICY.freeSpace.warningPct}% reserve − free ${fmt(freeGB, 1)} GB). Currently driven by the ${expansion.driver === "peak" ? "peak floor — snapshots would push free space under the policy minimum" : "sizing model"}. Recalculates from every roster, retention, memory and concurrency change.`
                      : "No expansion needed: the datastore satisfies the required sizing and still clears the policy free-space floor at peak snapshot demand."
                  }
                />
                <StatCard
                  label="Verdict" value={health.snapAuthorized ? "AUTHORIZED" : "DENIED"}
                  tone={health.snapAuthorized ? "success" : "danger"}
                  tip={`${health.status} — gate: free ≥ ${POLICY.freeSpace.approvedPct}% AND peak free ≥ ${POLICY.freeSpace.warningPct}%.`}
                />
              </div>

              {expansionCeil > 0 && (
                <motion.div layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                  <InfoBanner
                    sev={health.snapAuthorized ? "warning" : "danger"}
                    title={`Required datastore increase: +${expansionCeil.toLocaleString("en-US")} GB`}
                  >
                    {expansion.driver === "peak" ? (
                      <>
                        Sizing is not the binding constraint — the <strong>snapshot peak</strong> is. With this plan
                        ({mode === "worst" ? "all VMs at once" : `max ${k} concurrent`}, {retentionNum}d retention,{" "}
                        {memOn}/{vms.length} capturing memory), peak demand of {fmt(peakGB, 1)} GB would leave free space
                        below the {POLICY.freeSpace.warningPct}% floor. Add {expansionCeil.toLocaleString("en-US")} GB — or reduce
                        concurrency, retention, or memory-state capture to shrink the peak.
                      </>
                    ) : (
                      <>
                        Required capacity is {fmt(stats.requiredGB, 1)} GB against {fmt(capGB, 1)} GB provisioned.
                        Request <strong>+{expansionCeil.toLocaleString("en-US")} GB</strong> for {dsName || "this datastore"} to bring the
                        plan inside policy.
                      </>
                    )}
                  </InfoBanner>
                </motion.div>
              )}

              {mode === "staggered" && windows.length > 0 && (
                <Card title="Snapshot windows" sub="LPT-balanced schedule — run windows sequentially, consolidate before the next opens.">
                  <div className="flex flex-col" style={{ gap: 8 }}>
                    {windows.map((w, i) => {
                      const pct = maxWindowDemand > 0 ? (w.demandGB / maxWindowDemand) * 100 : 0;
                      const isPeak = w.demandGB === maxWindowDemand;
                      return (
                        <div key={i} className="flex items-center" style={{ gap: 10 }}>
                          <span className="font-num" style={{ width: 76, fontSize: 11, fontWeight: 800, color: "var(--text-3)", flexShrink: 0 }}>{w.label}</span>
                          <div style={{ flex: 1, height: 22, borderRadius: 7, background: "var(--bg-input)", border: "1px solid var(--border-1)", overflow: "hidden", position: "relative" }}>
                            <motion.div
                              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.7, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }}
                              style={{ height: "100%", background: isPeak ? "var(--maroon)" : "rgba(201,168,76,0.28)", borderRight: isPeak ? "2px solid var(--gold)" : "none" }}
                            />
                            <span className="font-num" style={{ position: "absolute", left: 8, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 10, color: "var(--text-2)", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "92%" }}>
                              {w.vmNames.join(", ")}
                            </span>
                          </div>
                          <span className="font-num" style={{ width: 92, textAlign: "right", fontSize: 11.5, fontWeight: 800, color: isPeak ? "var(--gold)" : "var(--text-2)", flexShrink: 0 }}>
                            {fmt(w.demandGB, 1)} GB{isPeak ? " (peak)" : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <Chip tone="gold" tip={`Staggered scheduling lowers peak demand from ${fmt(peakWorst(computed), 1)} GB (worst case) to ${fmt(peakGB, 1)} GB — ${fmt(100 - (peakWorst(computed) > 0 ? (peakGB / peakWorst(computed)) * 100 : 100), 0)}% less than simultaneous.`}>
                      {fmt(100 - (peakWorst(computed) > 0 ? (peakGB / peakWorst(computed)) * 100 : 100), 0)}% below worst case
                    </Chip>
                  </div>
                </Card>
              )}

              {!health.snapAuthorized && (
                <InfoBanner sev="danger" icon={<TriangleAlert size={18} />} title={`Plan is over the governance line (${health.status})`}>
                  {health.projectedFreePct < POLICY.freeSpace.warningPct
                    ? `At peak, free space falls to ${fmt(health.projectedFreePct, 1)}% — below the ${POLICY.freeSpace.warningPct}% floor. Reduce concurrency, shrink retention, or expand capacity before executing this schedule.`
                    : `Current free space is below ${POLICY.freeSpace.approvedPct}% — coordinate with the Storage Team before opening snapshots on this datastore.`}
                </InfoBanner>
              )}

              <div className="flex flex-wrap items-center" style={{ gap: 8 }}>
                <GhostButton
                  onClick={exportRunbook}
                  disabled={exporting}
                  icon={<Download size={14} />}
                  label={exporting ? "Exporting…" : "Export consolidation plan"}
                  title="XLSX runbook: plan summary, VM delta analysis, snapshot schedule and guardrails — reference-stamped for change management"
                />
                {spanCount > 0 && (
                  <Chip tone="warning" tip="VMs whose disks live on multiple datastores — snapshot demand lands on every one of them; run this plan for each affected datastore.">
                    {spanCount} spanning VM{spanCount > 1 ? "s" : ""}
                  </Chip>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* numeric context input with tooltip label */
function ContextNum({ label, tip, value, onChange }: { label: string; tip: string; value: UnitValue; onChange: (v: UnitValue) => void }) {
  return (
    <div>
      <FieldLabel tip={tip}>{label}</FieldLabel>
      <input
        type="number" inputMode="decimal" min={0} value={value.v}
        onChange={(e) => onChange({ ...value, v: e.target.value })}
        style={{
          width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-2)", borderRadius: 11,
          padding: "10px 12px", fontSize: 13.5, color: "var(--text-1)", outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--gold)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-2)")}
      />
    </div>
  );
}

/* inline roster cell: input-while-typing with local state, commits on blur/enter */
function NumCell({ value, onCommit, warn, width = 74 }: { value: number; onCommit: (n: number) => void; warn?: boolean; width?: number }) {
  const [v, setV] = useState(String(value));
  const commit = () => {
    const n = parseFloat(v);
    if (isNaN(n) || n < 0) {
      setV(String(value));
    } else {
      onCommit(n);
      setV(String(n));
    }
  };
  return (
    <input
      type="number" inputMode="decimal" min={0} value={v}
      key={value}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      style={{
        width, background: "var(--bg-input)", border: `1px solid ${warn ? "var(--amber)" : "var(--border-2)"}`, borderRadius: 9,
        padding: "6px 8px", fontSize: 12, color: warn ? "var(--amber)" : "var(--text-1)", outline: "none", textAlign: "right",
        fontFamily: "inherit",
      }}
    />
  );
}
