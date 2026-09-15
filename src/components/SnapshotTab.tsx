import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertTriangle, CalendarClock, Camera } from "lucide-react";
import { APP, POLICY } from "../config/policy";
import { allUnits, calcDWR, calcSnapshot, fmt, toGB, type SnapshotResult, type Unit, type UnitValue } from "../lib/engine";
import { usePersistentState } from "../lib/persist";
import { BigResult, CalcButton, Card, Field, Row, Toggle, UnitsGrid } from "./ui";

const UV = (u: Unit = "GB"): UnitValue => ({ v: "", u });
type Method = "throughput" | "backup";

const METHODS: { id: Method; label: string }[] = [
  { id: "throughput", label: "Throughput (KB/s)" },
  { id: "backup", label: "Backup Size" },
];

export default function SnapshotTab() {
  const [method, setMethod] = usePersistentState<Method>("sn.method", "throughput");
  const [kbps, setKbps] = usePersistentState("sn.kbps", "");
  const [bkup, setBkup] = usePersistentState<UnitValue>("sn.bkup", UV());
  const [days, setDays] = usePersistentState("sn.days", "7");
  const [sf, setSf] = usePersistentState("sn.sf", String(POLICY.snapshotSafetyFactor));
  const [mem, setMem] = usePersistentState("sn.mem", false);
  const [mRam, setMRam] = usePersistentState<UnitValue>("sn.mRam", UV());
  const [capVal, setCapVal] = usePersistentState<UnitValue>("sn.cap", UV("TB"));

  const [result, setResult] = useState<SnapshotResult | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const dwrLive = useMemo(() => (method === "throughput" ? calcDWR(kbps) : 0), [kbps, method]);
  const effDwr = useMemo(() => (method === "throughput" ? calcDWR(kbps) : toGB(bkup.v, bkup.u)), [method, kbps, bkup]);

  const livePrev = useMemo(() => {
    const d = parseInt(days) || 7;
    const s = parseFloat(sf) || POLICY.snapshotSafetyFactor;
    if (effDwr <= 0) return null;
    const capGB = toGB(capVal.v, capVal.u);
    let delta = effDwr * d * s;
    if (capGB > 0 && delta > capGB) delta = capGB;
    const total = delta + (mem ? toGB(mRam.v, mRam.u) + POLICY.memoryStateOverheadGB : 0);
    return fmt(total, 3);
  }, [effDwr, days, sf, mem, mRam, capVal]);

  const retentionAdvisory = parseInt(days) > POLICY.maxSnapshotAgeDays;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (method === "throughput" && (!kbps || parseFloat(kbps) <= 0)) e.kbps = "Required";
    if (method === "backup" && (!bkup.v || parseFloat(bkup.v) <= 0)) e.bkup = "Required";
    if (!days || parseInt(days) < 1) e.days = "Min 1 day";
    if (!sf || parseFloat(sf) < 1) e.sf = "Min 1.0";
    if (mem && (!mRam.v || parseFloat(mRam.v) <= 0)) e.mRam = "Required";
    setErrs(e);
    if (Object.keys(e).length > 0) {
      toast.error("Resolve the highlighted fields to continue");
      return false;
    }
    return true;
  }

  function calculate() {
    if (!validate()) return;
    setResult(
      calcSnapshot({
        dwr: effDwr,
        days: parseInt(days) || 7,
        sf: parseFloat(sf) || POLICY.snapshotSafetyFactor,
        mem,
        ramGB: mem ? toGB(mRam.v, mRam.u) : 0,
        capGB: toGB(capVal.v, capVal.u),
      })
    );
  }

  const units = result ? allUnits(result.total) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 22 }}>
      {/* ════════ INPUT ════════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card title="Daily Write Rate" sub="Estimate the data change rate behind the snapshot delta" accent="var(--blue)" delay={0}>
          <div className="flex" style={{ gap: 8, marginBottom: 18 }}>
            {METHODS.map((m) => {
              const active = method === m.id;
              return (
                <motion.button
                  key={m.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => {
                    setMethod(m.id);
                    setErrs({});
                  }}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    border: `1.5px solid ${active ? "var(--maroon)" : "var(--border-1)"}`,
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                    background: active ? "var(--maroon-bg)" : "var(--bg-input)",
                    color: active ? "var(--gold)" : "var(--text-3)",
                    transition: "all .2s",
                  }}
                >
                  {m.label}
                </motion.button>
              );
            })}
          </div>

          {method === "throughput" ? (
            <>
              <Field
                label="Avg Disk Write Throughput"
                num="1"
                hint="vCenter → Performance → Disk Write Rate (KBps) → 7-day average"
                value={kbps}
                onChange={(v) => {
                  setKbps(v);
                  setErrs({});
                }}
                showUnit={false}
                suffix="KB/s"
                error={errs.kbps}
              />
              {dwrLive > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between"
                  style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg-input)", border: "1px solid var(--border-1)", marginTop: -6, marginBottom: 6 }}
                >
                  <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--text-4)" }}>
                    Daily write rate
                  </span>
                  <span className="font-num" style={{ fontSize: 14, fontWeight: 700, color: "var(--green)" }}>
                    {fmt(dwrLive, 4)} GB/day
                  </span>
                </motion.div>
              )}
            </>
          ) : (
            <Field
              label="Incremental Backup Size"
              num="1"
              hint="Veeam / Commvault — size of the last incremental job"
              value={bkup.v}
              onChange={(v) => {
                setBkup({ v, u: bkup.u });
                setErrs({});
              }}
              unit={bkup.u}
              onUnit={(u) => setBkup({ v: bkup.v, u })}
              error={errs.bkup}
            />
          )}
        </Card>

        <Card title="Retention & Safety" accent="var(--amber)" delay={0.05}>
          <Field label="Retention Period" num="2" value={days} onChange={(v) => { setDays(v); setErrs({}); }} showUnit={false} suffix="days" step="1" error={errs.days} />
          <Field label="Safety Factor" num="3" hint={`${POLICY.snapshotSafetyFactor} = 20% headroom for write spikes`} value={sf} onChange={(v) => { setSf(v); setErrs({}); }} showUnit={false} suffix="×" step="0.1" error={errs.sf} />
          <AnimatePresence>
            {retentionAdvisory && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-start"
                style={{ gap: 8, overflow: "hidden", padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.6, background: "var(--amber-bg)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)" }}
              >
                <CalendarClock size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Beyond the {POLICY.maxSnapshotAgeDays}-day operational guideline — aging deltas raise consolidation
                  stun risk on high-I/O workloads. Plan commit windows.
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <Card title="Memory State" accent="var(--purple)" delay={0.1}>
          <Toggle
            checked={mem}
            onChange={setMem}
            label="Include memory snapshot"
            sub={mem ? "Adds RAM + ~100 MB (.vmsn memory capture)" : "Capture the VM memory state with the snapshot"}
          />
          <AnimatePresence>
            {mem && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} style={{ overflow: "hidden" }}>
                <div style={{ marginTop: 14 }}>
                  <Field
                    label="VM RAM"
                    num="4"
                    value={mRam.v}
                    onChange={(v) => {
                      setMRam({ v, u: mRam.u });
                      setErrs({});
                    }}
                    unit={mRam.u}
                    onUnit={(u) => setMRam({ v: mRam.v, u })}
                    error={errs.mRam}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Field
            label="Provisioned Disk Size"
            num="5"
            optional
            hint="Caps the delta estimate — a snapshot delta file can never exceed its base disk"
            value={capVal.v}
            onChange={(v) => setCapVal({ v, u: capVal.u })}
            unit={capVal.u}
            onUnit={(u) => setCapVal({ v: capVal.v, u })}
          />

          {livePrev && (
            <div
              className="flex items-center justify-between"
              style={{ padding: "12px 16px", borderRadius: 12, marginBottom: 10, background: "var(--maroon-bg)", border: "1px solid var(--gold-border)" }}
            >
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-3)" }}>
                Projected snapshot size
              </span>
              <span className="font-num shimmer-gold" style={{ fontSize: 18, fontWeight: 800 }}>
                {livePrev} GB
              </span>
            </div>
          )}

          <CalcButton onClick={calculate} label="Calculate snapshot sizing" />
        </Card>
      </div>

      {/* ════════ RESULTS ════════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }} aria-live="polite">
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div key="ph" exit={{ opacity: 0, scale: 0.96 }}>
              <Card delay={0.1}>
                <div style={{ textAlign: "center", padding: "72px 20px" }}>
                  <motion.div animate={{ y: [0, -9, 0] }} transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }} style={{ opacity: 0.16, marginBottom: 18 }}>
                    <Camera size={54} style={{ margin: "0 auto", color: "var(--gold)" }} />
                  </motion.div>
                  <p style={{ fontSize: 16.5, fontWeight: 600, color: "var(--text-3)" }}>Awaiting calculation</p>
                  <p style={{ fontSize: 13.5, color: "var(--text-4)", marginTop: 8 }}>Complete the inputs — results render here</p>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="r" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Card title="Snapshot Sizing Results" sub="Total = Data Delta + Memory State" accent="var(--green)" delay={0}>
                <Row label="Daily Write Rate" value={`${fmt(result.dwr, 4)} GB/day`} />
                <Row label="Retention" value={`${result.days} days`} />
                <Row label="Safety Factor" value={`×${result.sf}`} />
                <Row
                  label="Data Delta"
                  value={`${fmt(result.delta, 4)} GB`}
                  gold
                  badge={
                    result.capped ? (
                      <span className="flex items-center" style={{ gap: 5, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: "var(--amber-bg)", color: "var(--amber)", border: "1px solid rgba(245,158,11,0.3)" }}>
                        <AlertTriangle size={10} />
                        capped at provisioned
                      </span>
                    ) : undefined
                  }
                />
                {result.capped && (
                  <div className="font-num" style={{ padding: "8px 14px", margin: "2px 0 2px 20px", borderRadius: 8, fontSize: 12, background: "var(--bg-input)", border: "1px solid var(--border-1)", color: "var(--text-3)" }}>
                    uncapped growth would reach {fmt(result.deltaRaw, 4)} GB
                  </div>
                )}
                <Row label="Memory State" value={result.mem ? `${fmt(result.memSize, 4)} GB` : "Not included"} />
                <BigResult label="Total Snapshot Size" value={`${fmt(result.total, 4)} GB`} sub={`${fmt(units!.TB, 6)} TB   ·   ${fmt(units!.MB, 2)} MB`} />
                <UnitsGrid units={units!} />
                <div className="font-num" style={{ marginTop: 14, fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.4px" }}>
                  Computed under {APP.formulaVersion}
                </div>
              </Card>

              <Card title="Formula Walkthrough" accent="var(--blue)" delay={0.05}>
                <pre
                  className="font-num"
                  style={{
                    fontSize: 13,
                    lineHeight: 1.9,
                    padding: 18,
                    borderRadius: 14,
                    overflowX: "auto",
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-1)",
                    color: "var(--text-2)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                  }}
                >
{`Data Delta:
  = ${fmt(result.dwr, 4)} GB/day × ${result.days} days × ${result.sf}
  = ${fmt(result.deltaRaw, 4)} GB${result.capped ? `  →  capped at ${fmt(result.capGB, 2)} GB (provisioned size)` : ""}

Memory State:
  ${result.mem ? `= ${fmt(result.memSize, 4)} GB (RAM + ~100 MB)` : "= Not included"}

Total = ${fmt(result.delta, 4)} + ${fmt(result.memSize, 4)}
      = ${fmt(result.total, 4)} GB (${fmt(units!.TB, 6)} TB)`}
                </pre>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
