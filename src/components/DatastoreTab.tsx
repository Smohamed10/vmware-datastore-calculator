/**
 * TAB 1 — Capacity Assessment (single datastore).
 * Fully live: results recompute as the user types; linked fields derive
 * from each other unless the user takes manual control —
 *   Used space      ← Current total − Current free   (until typed over)
 *   Current total   ← Datastore capacity             (until typed over)
 *   Overhead reserve← 10% × Datastore capacity       (until typed over)
 * Two input methods: Manual entry | RVTools import (auto-fill stays editable).
 * Numbers entering inputs always pass through num() — never fmt() — so
 * locale-formatted strings (17,367.8) can never silently truncate values.
 */
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { CircleX, FileSpreadsheet, Gauge, ImageDown, Keyboard, Link2, ShieldCheck, ShieldX, Unlink2 } from "lucide-react";
import { APP, POLICY } from "../config/policy";
import {
  allUnits, calcDatastore, calcHealth, fmt, num, smartUnit, toGB, UNITS,
  type DatastoreResult, type HealthStatus, type UnitValue,
} from "../lib/engine";
import { runPreChecks } from "../lib/validation";
import { clearPersisted, usePersistentState } from "../lib/persist";
import { parseWorkbookFile, RVTOOLS_PARSER_VERSION, type RVInventory } from "../lib/bulk";
import { clearInventory, setInventory, useInventorySlot } from "../lib/inventoryStore";
import { exportAssessmentPng } from "../lib/report";
import {
  AnimatedValue, Card, Chip, ClearButton, EmptyState, FieldLabel, GhostButton, InfoBanner, InfoDot,
  LiveBadge, Meter, NumField, ResultRow, SectionLabel, Segmented, StatusPill, TextField, Tip, Toggle,
} from "./ui";
import FileDrop from "./FileDrop";

interface AssessmentDone {
  sizing: DatastoreResult;
  health: HealthStatus | null;
  echo: {
    datastoreName: string; cluster: string; naaLunId: string;
    usedGB: number; ramGB: number; dsCapGB: number; snapGB: number;
    curTotGB: number; curFreeGB: number; buffer: number; memSnap: boolean;
    source: "manual" | "rvtools";
  };
}

const uv = (v = "", u: UnitValue["u"] = "GB"): UnitValue => ({ v, u });
const stripCommas = (u: UnitValue): UnitValue => (u.v.includes(",") ? { ...u, v: u.v.replace(/,/g, "") } : u);

const DEFAULTS = {
  dsName: "", cluster: "", naaLunId: "",
  used: uv(), ram: uv(), dsCap: uv(), snap: uv(), curTot: uv(), curFree: uv(),
  buf: String(POLICY.safetyBuffer), memSnap: false, method: "manual" as "manual" | "rvtools",
};

export default function DatastoreTab() {
  const [method, setMethod] = usePersistentState<"manual" | "rvtools">("cap.method", DEFAULTS.method);
  const [dsName, setDsName] = usePersistentState("cap.dsName", DEFAULTS.dsName);
  const [cluster, setCluster] = usePersistentState("cap.cluster", DEFAULTS.cluster);
  const [naaLunId, setNaaLunId] = usePersistentState("cap.naaLunId", DEFAULTS.naaLunId);
  const [used, setUsed] = usePersistentState<UnitValue>("cap.used", DEFAULTS.used);
  const [ram, setRam] = usePersistentState<UnitValue>("cap.ram", DEFAULTS.ram);
  const [dsCap, setDsCap] = usePersistentState<UnitValue>("cap.dsCap", DEFAULTS.dsCap);
  const [snap, setSnap] = usePersistentState<UnitValue>("cap.snap", DEFAULTS.snap);
  const [curTot, setCurTot] = usePersistentState<UnitValue>("cap.curTot", DEFAULTS.curTot);
  const [curFree, setCurFree] = usePersistentState<UnitValue>("cap.curFree", DEFAULTS.curFree);
  const [buf, setBuf] = usePersistentState("cap.buf", DEFAULTS.buf);
  const [memSnap, setMemSnap] = usePersistentState("cap.memSnap", DEFAULTS.memSnap);

  /* link locks: false = field follows its source; true = user owns it */
  const [usedManual, setUsedManual] = usePersistentState("cap.usedManual", false);
  const [curTotManual, setCurTotManual] = usePersistentState("cap.curTotManual", false);
  const [snapManual, setSnapManual] = usePersistentState("cap.snapManual", false);

  const [busy, setBusy] = useState(false);

  /* RVTools side-channel — the parsed inventory lives in the session store
     so leaving this tab and returning keeps the workbook loaded. */
  const slot = useInventorySlot("capacity");
  const inv = slot?.inventory ?? null;
  const rvFile = slot?.fileName ?? "";
  const rvSource = slot?.source ?? "rvtools";
  const [rvDs, setRvDs] = usePersistentState("cap.rvDs", "");
  const [autoFilled, setAutoFilled] = usePersistentState("cap.autoFilled", false);

  /* ── one-time heal: purge locale-comma strings persisted by older builds ── */
  useEffect(() => {
    setUsed(stripCommas); setRam(stripCommas); setDsCap(stripCommas);
    setSnap(stripCommas); setCurTot(stripCommas); setCurFree(stripCommas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── derived numbers ── */
  const dsCapGB = toGB(dsCap.v, dsCap.u);
  const derivedReserveGB = +(dsCapGB * POLICY.overheadPercent).toFixed(2);
  const snapGB = snap.v ? toGB(snap.v, snap.u) : derivedReserveGB;
  const curTotGB = toGB(curTot.v, curTot.u);
  const curFreeGB = toGB(curFree.v, curFree.u);
  const overheadOverridden = snapManual && dsCapGB > 0 && Math.abs(snapGB - derivedReserveGB) > 0.001;

  /* ── linked-field derivation (runs until the user takes control) ── */
  useEffect(() => {
    if (!snapManual && dsCapGB > 0) setSnap({ v: num(dsCapGB * POLICY.overheadPercent, 2), u: "GB" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsCapGB, snapManual]);

  useEffect(() => {
    if (!curTotManual && dsCapGB > 0) setCurTot({ v: num(dsCapGB, 2), u: dsCap.u });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsCapGB, dsCap.u, curTotManual]);

  useEffect(() => {
    if (!usedManual && curTotGB > 0 && curFreeGB >= 0 && curFreeGB <= curTotGB && (curFree.v !== "")) {
      setUsed({ v: num(curTotGB - curFreeGB, 2), u: "GB" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curTotGB, curFreeGB, curFree.v, usedManual]);

  /* ── validation + LIVE result ── */
  const pre = useMemo(
    () =>
      runPreChecks({
        used, ram, dsCap, snap: snap.v ? snap : uv(String(derivedReserveGB), "GB"),
        curTot, curFree, buf, memSnap,
      }),
    [used, ram, dsCap, snap, derivedReserveGB, curTot, curFree, buf, memSnap]
  );
  const anyValue = !!(used.v || ram.v || dsCap.v || curTot.v || curFree.v);
  const invalid = (field: string) => anyValue && pre.errors.some((e) => e.field === field);

  const live = useMemo<AssessmentDone | null>(() => {
    if (pre.errors.length > 0) return null;
    const sizing = calcDatastore({
      usedGB: toGB(used.v, used.u), ramGB: toGB(ram.v, ram.u),
      snapGB, buffer: parseFloat(buf), memSnap,
    });
    const health = calcHealth(curTotGB || dsCapGB, curFreeGB, sizing.required, snapGB);
    return {
      sizing, health,
      echo: {
        datastoreName: dsName.trim(), cluster: cluster.trim(), naaLunId: naaLunId.trim(),
        usedGB: toGB(used.v, used.u), ramGB: toGB(ram.v, ram.u), dsCapGB, snapGB,
        curTotGB: curTotGB || dsCapGB, curFreeGB, buffer: parseFloat(buf), memSnap,
        source: method === "rvtools" && autoFilled ? "rvtools" : "manual",
      },
    };
  }, [pre, used, ram, snapGB, buf, memSnap, curTotGB, dsCapGB, curFreeGB, dsName, cluster, naaLunId, method, autoFilled]);

  /* ── actions ── */
  async function importWorkbook(file: File) {
    setBusy(true);
    try {
      const outcome = await parseWorkbookFile(file);
      let inventory: RVInventory;
      if (outcome.inventory) {
        inventory = outcome.inventory;
      } else {
        inventory = {
          datastores: outcome.rows
            .filter((r) => r.datastore && r.capacityGB > 0)
            .map((r) => ({
              name: r.datastore, capacityGB: r.capacityGB, provisionedGB: r.provisionedGB ?? null,
              freeGB: r.freeGB, usedGB: r.usedGB, cluster: r.cluster, naaLunId: r.naaLunId || undefined,
            })),
          vms: [],
        };
      }
      if (inventory.datastores.length === 0) {
        toast.error("No usable datastores found in that file.");
        return;
      }
      setInventory("capacity", { inventory, fileName: file.name, source: outcome.source, loadedAt: Date.now() });
      setAutoFilled(false);
      setRvDs("");
      toast.success(`${outcome.source === "rvtools" ? "RVTools" : "Template"} loaded — ${inventory.datastores.length} datastores found`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not parse that workbook.");
    } finally {
      setBusy(false);
    }
  }

  function applyRVTools(name: string) {
    setRvDs(name);
    const ds = inv?.datastores.find((d) => d.name === name);
    if (!ds) return;
    const ramGB = inv!.vms
      .filter((v) => v.disks.some((d) => d.datastore === name))
      .reduce((s, v) => s + v.ramGB, 0);
    const usedGB = ds.usedGB ?? +(ds.capacityGB - ds.freeGB).toFixed(2);
    setDsName(ds.name);
    setCluster(ds.cluster ?? "");
    setNaaLunId(ds.naaLunId ?? "");
    setDsCap(uv(num(ds.capacityGB, 2)));
    setCurTot(uv(num(ds.capacityGB, 2)));
    setCurFree(uv(num(ds.freeGB, 2)));
    setUsed(uv(num(usedGB, 2)));
    setRam(uv(num(ramGB, 2)));
    /* explicit values from inventory → user-owned links stay released so the
       10% reserve still tracks capacity edits afterwards */
    setUsedManual(true);
    setCurTotManual(false);
    setSnapManual(false);
    setAutoFilled(true);
    toast.success(`${ds.name} applied — review and calculate`);
  }

  function clearAll() {
    clearPersisted("cap.");
    setMethod(DEFAULTS.method);
    setDsName(DEFAULTS.dsName);
    setCluster(DEFAULTS.cluster);
    setNaaLunId(DEFAULTS.naaLunId);
    setUsed(DEFAULTS.used); setRam(DEFAULTS.ram); setDsCap(DEFAULTS.dsCap);
    setSnap(DEFAULTS.snap); setCurTot(DEFAULTS.curTot); setCurFree(DEFAULTS.curFree);
    setBuf(DEFAULTS.buf); setMemSnap(DEFAULTS.memSnap);
    setUsedManual(false); setCurTotManual(false); setSnapManual(false);
    clearInventory("capacity"); setRvDs(""); setAutoFilled(false);
    toast.success("Inputs cleared — saved values wiped for this tab");
  }

  async function exportPng() {
    if (!live) return;
    toast.loading("Rendering PNG report…", { id: "png" });
    try {
      const ref = await exportAssessmentPng({ ...live.echo, sizing: live.sizing, health: live.health });
      toast.success(`Report ${ref} exported`, { id: "png" });
    } catch {
      toast.error("PNG export failed", { id: "png" });
    }
  }

  /* link toggle helper */
  function LinkChip({ manual, onToggle, what }: { manual: boolean; onToggle: () => void; what: string }) {
    return (
      <Tip
        tip={manual ? `${what} is under manual control — click to release it back to automatic derivation.` : `${what} auto-derives from the linked inputs as they change. Type to override, or click to reapply the derivation now.`}
        title={manual ? "Manual" : "Linked"}
      >
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center font-num"
          style={{
            gap: 5, background: "none", border: "none", cursor: "pointer", padding: 0,
            fontSize: 10.5, fontWeight: 800, letterSpacing: "0.6px",
            color: manual ? "var(--gold)" : "var(--text-4)",
          }}
        >
          {manual ? <Unlink2 size={10} /> : <Link2 size={10} />}
          {manual ? "MANUAL" : "LINKED"}
        </button>
      </Tip>
    );
  }

  /* ── render ── */
  const h = live?.health;
  const missing = pre.errors.slice(0, 3);

  return (
    <div
      className="mx-auto grid items-start"
      style={{ maxWidth: 1500, padding: "24px 20px 8px", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}
    >
      {/* ── inputs ── */}
      <Card
        title="Capacity inputs"
        right={<ClearButton onClick={clearAll} />}
        sub={
          method === "manual"
            ? "Type the inventory figures — linked fields derive from each other until you override them. Everything documents itself on hover."
            : "Drop an RVTools export, pick a datastore, and the sizing inputs fill themselves."
        }
      >
        <Segmented
          value={method}
          onChange={setMethod}
          options={[
            { value: "manual", label: (<span className="inline-flex items-center" style={{ gap: 7 }}><Keyboard size={13} /> Manual entry</span>) },
            { value: "rvtools", label: (<span className="inline-flex items-center" style={{ gap: 7 }}><FileSpreadsheet size={13} /> RVTools import</span>) },
          ]}
        />

        <AnimatePresence mode="wait">
          {method === "rvtools" && (
            <motion.div
              key="rv"
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 14 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              style={{ overflow: "hidden" }}
            >
              {!inv ? (
                <FileDrop
                  onFile={importWorkbook}
                  busy={busy}
                  compact
                  label="Drop an RVTools export (.xlsx) — or the template"
                  note="vDatastore is required; vMultiPath adds the NAA / LUN identifier, vInfo + vDisk add per-VM RAM."
                />
              ) : (
                <div className="rounded-xl" style={{ padding: 14, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
                  <div className="flex items-center justify-between flex-wrap" style={{ gap: 8 }}>
                    <div className="flex items-center font-num" style={{ gap: 8, fontSize: 12, color: "var(--text-1)", fontWeight: 700 }}>
                      <FileSpreadsheet size={15} style={{ color: "var(--gold)" }} />
                      {rvFile}
                    </div>
                    <div className="flex items-center" style={{ gap: 6 }}>
                      {rvSource === "rvtools" && <Chip tone="gold" tip="RVTools parser build that read this file. Re-import after a parser upgrade so cached results are refreshed.">{RVTOOLS_PARSER_VERSION}</Chip>}
                      <GhostButton label="Replace" onClick={() => { clearInventory("capacity"); setRvDs(""); setAutoFilled(false); }} />
                    </div>
                  </div>
                  <div className="flex flex-wrap" style={{ gap: 6, marginTop: 10 }}>
                    <Chip tip="Workbook rows that were successfully mapped to datastores.">{inv.datastores.length} datastores</Chip>
                    <Chip tip="NAA / LUN identifiers captured from vMultiPath (the Disk column) or an identifier column. Flows into the Storage Team report.">
                      {inv.datastores.filter((d) => d.naaLunId).length} LUN ids
                    </Chip>
                    <Chip tip="Virtual machines parsed from vDisk + vInfo — their RAM is summed per datastore.">{inv.vms.length} VMs</Chip>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <FieldLabel tip="Choose the datastore to assess. Capacity, free space, used space and aggregate VM RAM are auto-filled (machine-safe numbers) and stay editable.">
                      Datastore from inventory
                    </FieldLabel>
                    <select
                      value={rvDs}
                      onChange={(e) => e.target.value && applyRVTools(e.target.value)}
                      className="font-num"
                      style={{
                        width: "100%", background: "var(--bg-2)", border: "1px solid var(--border-2)", borderRadius: 11,
                        padding: "10px 12px", fontSize: 13, color: "var(--text-1)", cursor: "pointer", outline: "none",
                      }}
                      aria-label="Select datastore"
                    >
                      <option value="">— pick a datastore —</option>
                      {inv.datastores.map((d) => (
                        <option key={d.name} value={d.name}>
                          {d.name} — {fmt(d.capacityGB, 1)} GB · {fmt(d.freeGB, 1)} free{d.naaLunId ? " · has LUN id" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {autoFilled && (
          <div style={{ marginTop: 12 }}>
            <Chip tone="success" tip="These values came from the imported workbook. They remain fully editable — adjust anything and watch the results update live.">
              <ShieldCheck size={11} /> Auto-filled from inventory — editable
            </Chip>
          </div>
        )}

        <SectionLabel>Identity</SectionLabel>
        <TextField
          label="Datastore name" value={dsName} onChange={setDsName} placeholder="DS-PROD-01"
          tip="Datastore name exactly as it appears in vCenter. Echoed onto the exported report's identity block."
        />
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
          <TextField
            label="Cluster (optional)" value={cluster} onChange={setCluster} placeholder="POD-PROD"
            tip="Datastore cluster / Storage Pod. Optional context, echoed onto the report for the Storage Team."
          />
          <TextField
            label="NAA / LUN ID (optional)" value={naaLunId} onChange={setNaaLunId} placeholder="naa.6000… / LUN 12"
            tip="SCSI identifier of the backing LUN (NAA canonical name naa.…/eui.…, serial, or UUID). Optional but recommended: it lands on the report so expansion actions target the exact device. Auto-filled from RVTools vMultiPath when present."
          />
        </div>

        <SectionLabel>Sizing inputs</SectionLabel>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
              <span style={{ flex: 1 }} />{/* keeps label row alignment via NumField's own label */}
            </div>
            <NumField
              label="Used space" value={used} onChange={(v) => { setUsedManual(true); setUsed(v); }} invalid={invalid("used")}
              tip="Currently consumed capacity (all VMDKs, ISOs, swap). Linked mode: derived as Current total − Current free until you type here. Required — it anchors the sizing sum."
              hint={<LinkChip manual={usedManual} onToggle={() => { if (usedManual) { setUsedManual(false); if (curTotGB > 0 && curFree.v !== "" && curFreeGB <= curTotGB) setUsed(uv(num(curTotGB - curFreeGB, 2))); } }} what="Used space" />}
            />
          </div>
          <NumField
            label="Aggregate VM RAM" value={ram} onChange={setRam} invalid={invalid("ram")}
            tip="Sum of RAM across VMs homed on this datastore. Reserved during sizing so memory-state snapshots (.vmsn) fit — the value doubles when the memory-snapshot toggle below is on."
          />
          <NumField
            label="Datastore capacity" value={dsCap} onChange={setDsCap} invalid={invalid("dsCap")}
            tip="Total provisioned capacity. Required — the policy overhead reserve (10%) derives from it, and Current total links to it. Drives the whole sizing model."
            hint={
              <>
                Policy reserve:{" "}
                <button
                  type="button" className="tip-anchor font-num"
                  style={{ background: "none", border: "none", cursor: "help", color: "var(--gold)", fontSize: 11, padding: 0 }}
                  onClick={() => { setSnapManual(false); setSnap(uv(num(derivedReserveGB, 2))); }}
                >
                  10% → {fmt(derivedReserveGB)} GB — click to apply
                </button>
              </>
            }
          />
          <NumField
            label="Snapshot overhead reserve" value={snap} onChange={(v) => { setSnapManual(true); setSnap(v); }}
            tip="Space reserved for snapshot growth. Linked mode: always 10% of Datastore capacity (policy). Override for change-heavy datastores — overrides are tracked on the report. Also feeds the peak-demand health estimate."
            hint={<LinkChip manual={snapManual} onToggle={() => { if (snapManual) { setSnapManual(false); setSnap(uv(num(dsCapGB * POLICY.overheadPercent, 2))); } }} what="Overhead reserve" />}
          />
        </div>
        {overheadOverridden && (
          <div style={{ marginTop: 10 }}>
            <Chip tone="gold" tip="The reserve differs from the 10% policy default. The override is explicitly recorded in the exported report.">
              Policy override: reserve ≠ 10% — tracked in report
            </Chip>
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <Toggle
            checked={memSnap} onChange={setMemSnap}
            label={
              <Tip tip="When enabled, the sizing reserves twice the aggregate RAM (snapshot .vmsn files plus consolidation headroom). Memory-state snapshots capture live RAM and cost the most space." title="Memory-state snapshots">
                Include memory-state snapshots <InfoDot />
              </Tip>
            }
            sub="Effective RAM = 2 × aggregate VM RAM in the sizing sum."
          />
        </div>

        <SectionLabel>Current state · health governance</SectionLabel>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <NumField
            label="Current total capacity" value={curTot} onChange={(v) => { setCurTotManual(true); setCurTot(v); }} invalid={invalid("curTot")}
            tip="The datastore's capacity today. Linked mode: follows Datastore capacity until you override it (e.g. modeling an already-approved expansion). Drives the free-space health model."
            hint={<LinkChip manual={curTotManual} onToggle={() => { if (curTotManual) { setCurTotManual(false); setCurTot({ v: num(dsCapGB, 2), u: dsCap.u }); } }} what="Current total" />}
          />
          <NumField
            label="Current free space" value={curFree} onChange={setCurFree} invalid={invalid("curFree")}
            tip={`Free space right now. Approved line: ≥ ${POLICY.freeSpace.approvedPct}% of capacity. Below ${POLICY.freeSpace.warningPct}% snapshots are denied outright. Editing it (in linked mode) also refreshes Used space.`}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <FieldLabel tip={`Safety buffer multiplier on the raw sizing sum — policy default ${POLICY.safetyBuffer}× to hold ~20–25% operational headroom. Values above ${POLICY.bufferWarningAbove}× raise a plausibility warning.`}>
            Safety buffer <InfoDot />
          </FieldLabel>
          <div className="flex items-center" style={{ gap: 8 }}>
            {[1.15, 1.25, 1.5].map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBuf(String(b))}
                className="font-num"
                style={{
                  padding: "8px 13px", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 800,
                  color: buf === String(b) ? "#f3dd9a" : "var(--text-3)",
                  background: buf === String(b) ? "var(--maroon)" : "var(--bg-input)",
                  border: `1px solid ${buf === String(b) ? "var(--gold-border)" : "var(--border-2)"}`,
                }}
              >
                {b}×
              </button>
            ))}
            <input
              type="number" step="0.05" min={1} value={buf} onChange={(e) => setBuf(e.target.value)}
              className="font-num" aria-label="Custom buffer"
              style={{
                width: 90, background: "var(--bg-input)", border: `1px solid ${invalid("buf") ? "var(--red)" : "var(--border-2)"}`,
                borderRadius: 10, padding: "8px 10px", fontSize: 12.5, color: "var(--text-1)", outline: "none",
              }}
            />
          </div>
        </div>

        {anyValue && pre.errors.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {pre.errors.slice(0, 4).map((e, i) => (
              <div key={i} className="flex items-center" style={{ gap: 7, fontSize: 12, color: "var(--red)", padding: "3px 0" }}>
                <CircleX size={13} style={{ flexShrink: 0 }} /> {e.msg}
              </div>
            ))}
          </div>
        )}
        {pre.warnings.length > 0 && anyValue && (
          <div style={{ marginTop: 14 }}>
            <InfoBanner sev="warning" title="Plausibility warnings">
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {pre.warnings.slice(0, 4).map((w, i) => (
                  <li key={i} style={{ fontSize: 12, lineHeight: 1.55 }}>{w}</li>
                ))}
              </ul>
              {pre.warnings.length > 4 && <div style={{ fontSize: 11, marginTop: 4 }}>…and {pre.warnings.length - 4} more</div>}
            </InfoBanner>
          </div>
        )}
      </Card>

      {/* ── results (live) ── */}
      <div className="flex flex-col" style={{ gap: 16 }}>
        {!live ? (
          <Card className="min-h-[420px]">
            <EmptyState
              icon={<Gauge size={28} strokeWidth={1.7} />}
              title="Assessment output appears here — live"
              body={`Fill the sizing inputs (or import an RVTools export and pick a datastore). Results recompute with every keystroke: required capacity, the free-space governance verdict (policy lines ${POLICY.freeSpace.approvedPct}% / ${POLICY.freeSpace.warningPct}%), and a PNG report for the change record.`}
            >
              {missing.length > 0 && anyValue ? (
                <div className="text-left rounded-xl" style={{ padding: "10px 16px", background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: "var(--text-4)", marginBottom: 6 }}>TO COMPLETE</div>
                  {missing.map((e, i) => (
                    <div key={i} className="flex items-center" style={{ gap: 7, fontSize: 12, color: "var(--text-3)", padding: "2px 0" }}>
                      <CircleX size={12} style={{ color: "var(--amber)", flexShrink: 0 }} /> {e.msg}
                    </div>
                  ))}
                </div>
              ) : (
                <Chip tone="gold">2 input methods · linked fields · hover any label for documentation</Chip>
              )}
            </EmptyState>
          </Card>
        ) : (
          <>
            {/* verdict banner */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <InfoBanner
                sev={h?.sev ?? "warning"}
                title={
                  <span className="flex items-center flex-wrap" style={{ gap: 10 }}>
                    Health verdict: {h?.status ?? "NOT ASSESSED"}
                    {h && (
                      <StatusPill sev={h.snapAuthorized ? "success" : "danger"}>
                        {h.snapAuthorized ? <ShieldCheck size={11} /> : <ShieldX size={11} />}
                        &nbsp;Snapshots {h.snapAuthorized ? "AUTHORIZED" : "DENIED"}
                      </StatusPill>
                    )}
                  </span>
                }
              >
                {h?.msg}
                {live.echo.datastoreName && (
                  <span className="font-num" style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "var(--text-3)" }}>
                    {live.echo.datastoreName}
                    {live.echo.cluster ? ` · ${live.echo.cluster}` : ""}
                    {live.echo.naaLunId ? ` · ${live.echo.naaLunId}` : ""} · {live.echo.source === "rvtools" ? "RVTools import" : "manual entry"}
                  </span>
                )}
              </InfoBanner>
            </motion.div>

            {/* sizing result */}
            <Card
              title="Sizing result"
              right={
                <div className="flex items-center" style={{ gap: 8 }}>
                  <LiveBadge />
                  <GhostButton
                    onClick={exportPng}
                    icon={<ImageDown size={14} />}
                    label="Export PNG report"
                    title="Theme-aware PNG with reference ID, inputs echo, assumptions and sign-off block — attach it to the change ticket"
                  />
                </div>
              }
            >
              <div className="flex items-end flex-wrap" style={{ gap: 18 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--text-4)" }}>
                    <Tip tip="Required datastore capacity = (Used + effective RAM + overhead reserve) × safety buffer. The size this datastore should be to host the workload and its snapshots within policy." title="Required capacity">
                      Required capacity <InfoDot />
                    </Tip>
                  </div>
                  <div className="font-num" style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-1px", color: "var(--gold)", lineHeight: 1.05, marginTop: 6 }}>
                    <AnimatedValue value={live.sizing.required} format={(n) => smartUnit(n)} />
                  </div>
                </div>
                <div className="flex flex-wrap" style={{ gap: 6, maxWidth: 430, marginLeft: "auto" }}>
                  {UNITS.map((u) => (
                    <Chip key={u} tip={`Required capacity expressed in ${u}.`}>
                      {u}: {fmt(allUnits(live.sizing.required)[u], u === "PB" || u === "KB" ? 1 : 2)}
                    </Chip>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <ResultRow label="Used space" tip="Consumed capacity reported on this datastore." value={`${fmt(live.echo.usedGB)} GB`} />
                <ResultRow
                  label="Effective RAM" value={`${fmt(live.sizing.ramGB)} GB`}
                  tip={live.sizing.memSnap ? `Aggregate RAM ${fmt(live.sizing.origRamGB)} GB doubled — memory-state snapshots capture live RAM.` : "Aggregate VM RAM (memory-state snapshots not included)."}
                />
                <ResultRow label="Overhead reserve" tip="Snapshot overhead reserve applied to the sizing sum (10% of capacity policy default; overrides tracked)." value={`${fmt(live.sizing.snapGB)} GB`} />
                <ResultRow label="Raw sum" tip="Used + effective RAM + reserve — before the safety buffer." value={`${fmt(live.sizing.raw)} GB`} />
                <ResultRow label="Buffer padding" tip={`Headroom added by the ${live.echo.buffer}× safety buffer (+${live.sizing.bufferPct.toFixed(0)}%).`} value={`+${fmt(live.sizing.padding)} GB`} />
                <ResultRow label="Required capacity" tip="Raw sum × safety buffer." strong tone="gold" value={smartUnit(live.sizing.required)} />
              </div>
            </Card>

            {/* health */}
            {h && (
              <Card title="Health & governance">
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>
                      <Tip tip={`Free space today, as a percentage of capacity. Approved line ${POLICY.freeSpace.approvedPct}%: at or above it, snapshot operations are within policy.`} title="Current free space">
                        Current free space <InfoDot />
                      </Tip>
                    </div>
                    <Meter
                      pct={h.freePct} sev={h.sev} markerPct={POLICY.freeSpace.approvedPct}
                      left={`${fmt(h.freePct)}% · ${fmt(h.freeGB)} GB free`} right={`capacity ${fmt(h.totalGB)} GB`}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>
                      <Tip tip={`Free space remaining at snapshot peak = (Free − Demand) ÷ capacity. Demand on this tab is the ${fmt(live.sizing.snapGB)} GB overhead reserve. Snapshots stay authorized only while this holds ≥ ${POLICY.freeSpace.warningPct}%.`} title="Projected free at peak">
                        Projected free at peak <InfoDot />
                      </Tip>
                    </div>
                    <Meter
                      pct={Math.max(h.projectedFreePct, 0)}
                      sev={h.projectedFreePct >= POLICY.freeSpace.approvedPct ? "success" : h.projectedFreePct >= POLICY.freeSpace.warningPct ? "warning" : "danger"}
                      markerPct={POLICY.freeSpace.warningPct}
                      left={`${fmt(h.projectedFreePct)}% after ${fmt(live.sizing.snapGB)} GB demand`}
                      right={h.breachAtPeak ? "policy breach at peak" : "held at peak"}
                    />
                  </div>
                </div>

                {h.breachAtPeak && (
                  <div style={{ marginTop: 16 }}>
                    <InfoBanner sev="warning" title="Passes today — breaches at peak">
                      Free space is above {POLICY.freeSpace.approvedPct}% now, but the projected snapshot demand would drag it below the policy
                      line. Schedule consolidation windows or expand capacity before snapshot storms.
                    </InfoBanner>
                  </div>
                )}
                {!h.sufficient && (
                  <div style={{ marginTop: 16 }}>
                    <InfoBanner sev="danger" title={`Expansion required: +${Math.ceil(h.gapGB).toLocaleString("en-US")} GB`}>
                      Current capacity {smartUnit(h.totalGB)} is below the required {smartUnit(live.sizing.required)}. Request an expansion of at
                      least {Math.ceil(h.gapGB).toLocaleString("en-US")} GB{live.echo.naaLunId ? ` against LUN ${live.echo.naaLunId}` : ""} to bring this datastore into policy.
                    </InfoBanner>
                  </div>
                )}
                {h.sufficient && !h.breachAtPeak && (
                  <div style={{ marginTop: 16 }}>
                    <InfoBanner sev="success" title="Ready — within policy">
                      Capacity covers the required sizing with {fmt((h.totalGB - live.sizing.required) / 1024, 2)} TB of margin, and peak snapshot
                      demand stays above the governance floor.
                    </InfoBanner>
                  </div>
                )}

                <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border-1)" }} className="flex flex-wrap items-center" >
                  <span style={{ fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.6px" }} className="font-num">
                    {APP.formulaVersion} · buffer {live.echo.buffer}× · thresholds {POLICY.freeSpace.approvedPct}/{POLICY.freeSpace.warningPct}% free · {APP.classification}
                  </span>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
