/**
 * TAB 2 — Snapshot Sizing (per-VM delta estimate) — fully live.
 * delta = daily write rate × retention days × safety factor, capped at the
 * provisioned disk size (a delta file can never outgrow its base). Optional
 * memory-state (.vmsn) sizing on top. The footprint recomputes on every
 * keystroke; every value documents itself on hover.
 */
import { useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { AlarmClockCheck, Camera, Layers, TrendingUp } from "lucide-react";
import toast from "react-hot-toast";
import { POLICY } from "../config/policy";
import { allUnits, calcDWR, calcSnapshot, fmt, smartUnit, toGB, UNITS, type UnitValue } from "../lib/engine";
import { clearPersisted, usePersistentState } from "../lib/persist";
import {
  AnimatedValue, Card, Chip, ClearButton, EmptyState, InfoBanner, InfoDot, LiveBadge, Meter,
  NumField, ResultRow, SectionLabel, Segmented, Tip, Toggle,
} from "./ui";

const uv = (v = "", u: UnitValue["u"] = "GB"): UnitValue => ({ v, u });

/** Cleared state = genuinely empty. Only the safety factor keeps a value,
 *  because it is a policy constant (a multiplier the formula needs), not
 *  sample data. Nothing else is pre-filled, so "Clear" really clears. */
const DEFAULTS = {
  mode: "kbps" as "kbps" | "gbday",
  kbps: "", gbday: "",
  days: "", sf: String(POLICY.snapshotSafetyFactor),
  cap: uv(""), ram: uv(""), mem: false,
};

export default function SnapshotTab() {
  const [mode, setMode] = usePersistentState<"kbps" | "gbday">("snap.mode", DEFAULTS.mode);
  const [kbps, setKbps] = usePersistentState("snap.kbps", DEFAULTS.kbps);
  const [gbday, setGbday] = usePersistentState("snap.gbday", DEFAULTS.gbday);
  const [days, setDays] = usePersistentState("snap.days", DEFAULTS.days);
  const [sf, setSf] = usePersistentState("snap.sf", DEFAULTS.sf);
  const [cap, setCap] = usePersistentState<UnitValue>("snap.cap", DEFAULTS.cap);
  const [ram, setRam] = usePersistentState<UnitValue>("snap.ram", DEFAULTS.ram);
  const [mem, setMem] = usePersistentState("snap.mem", DEFAULTS.mem);

  /* heal comma-formatted strings persisted by older builds */
  useEffect(() => {
    setCap((p) => (p.v.includes(",") ? { ...p, v: p.v.replace(/,/g, "") } : p));
    setRam((p) => (p.v.includes(",") ? { ...p, v: p.v.replace(/,/g, "") } : p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dwr = useMemo(() => (mode === "kbps" ? calcDWR(kbps) : Math.max(0, parseFloat(gbday) || 0)), [mode, kbps, gbday]);
  const retentionDays = Math.max(0, parseFloat(days) || 0);
  const safetyFactor = Math.max(1, parseFloat(sf) || POLICY.snapshotSafetyFactor);
  const ready = dwr > 0 && retentionDays > 0;
  const capGB = toGB(cap.v, cap.u);
  const agedRetention = retentionDays > POLICY.maxSnapshotAgeDays;

  /* live result — recomputed on every input change */
  const done = useMemo(
    () =>
      ready
        ? calcSnapshot({
            dwr, days: retentionDays, sf: safetyFactor, mem,
            ramGB: toGB(ram.v, ram.u), capGB,
          })
        : null,
    [ready, dwr, retentionDays, safetyFactor, mem, ram, capGB]
  );

  function clearAll() {
    clearPersisted("snap.");
    setMode(DEFAULTS.mode); setKbps(DEFAULTS.kbps); setGbday(DEFAULTS.gbday);
    setDays(DEFAULTS.days); setSf(DEFAULTS.sf); setCap(DEFAULTS.cap); setRam(DEFAULTS.ram); setMem(DEFAULTS.mem);
    toast.success("Inputs cleared — every field is empty and saved values are wiped");
  }

  const capPct = done && capGB > 0 ? Math.min((done.delta / capGB) * 100, 100) : 0;

  return (
    <div
      className="mx-auto grid items-start"
      style={{ maxWidth: 1500, padding: "24px 20px 8px", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}
    >
      {/* inputs */}
      <Card
        title="Snapshot inputs"
        sub="Estimate how large one VM's snapshot chain will grow — everything updates live; hover any label for the rule behind it."
        right={<ClearButton onClick={clearAll} />}
      >
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: "kbps", label: "From write throughput (KB/s)" },
            { value: "gbday", label: "Direct GB/day rate" },
          ]}
        />

        <SectionLabel>Change rate</SectionLabel>
        {mode === "kbps" ? (
          <div className="flex items-end" style={{ gap: 10 }}>
            <div style={{ flex: 1 }}>
              <NumLikeInput
                label="Average write throughput (KB/s)"
                tip="Sustained write rate to the VM's disks — pull it from vCenter performance charts (average over a representative day). Converted with KB/s × 86,400 ÷ 1,048,576 ≈ 0.0824 GB/day per KB/s."
                value={kbps} onChange={setKbps}
              />
            </div>
            <Chip tone="gold" tip="Daily delta derived from the throughput you entered — this is the number the delta sizing actually uses.">
              ≈ {fmt(dwr, 2)} GB/day
            </Chip>
          </div>
        ) : (
          <NumLikeInput
            label="Daily write rate (GB/day)"
            tip="Net bytes written to disk per day (changed blocks). If you measured this externally — backup change logs, guest counters — enter it directly."
            value={gbday} onChange={setGbday}
          />
        )}

        <SectionLabel>Retention & safety</SectionLabel>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <NumLikeInput
              label="Retention (days)"
              tip={`Days the snapshot chain is expected to live before consolidation. Operational guideline: ≤ ${POLICY.maxSnapshotAgeDays} day(s).`}
              value={days} onChange={setDays} step={1}
            />
            <div className="flex" style={{ gap: 6, marginTop: 8 }}>
              {["1", "2", "3", "7"].map((d) => (
                <button
                  key={d} type="button" onClick={() => setDays(d)}
                  className="font-num"
                  style={{
                    flex: 1, padding: "6px 0", borderRadius: 9, cursor: "pointer", fontSize: 11.5, fontWeight: 800,
                    color: days === d ? "#f3dd9a" : "var(--text-3)",
                    background: days === d ? "var(--maroon)" : "var(--bg-input)",
                    border: `1px solid ${days === d ? "var(--gold-border)" : "var(--border-2)"}`,
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
          <NumLikeInput
            label="Safety factor"
            tip={`Spike headroom applied to the raw delta (policy default ${POLICY.snapshotSafetyFactor}×). Bump it for bursty/OLTP workloads.`}
            value={sf} onChange={setSf} step={0.05}
          />
        </div>

        <SectionLabel>Disk & memory context</SectionLabel>
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <NumField
            label="Provisioned disk size (cap)" value={cap} onChange={setCap}
            tip="Provisioned size of the base VMDK. A delta file can never outgrow its base disk, so the estimate is hard-capped here."
          />
          <NumField
            label="VM RAM" value={ram} onChange={setRam}
            tip="Guest RAM — only used when memory state is captured. The .vmsn file costs roughly RAM + 100 MB."
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <Toggle
            checked={mem} onChange={setMem}
            label={
              <Tip tip="Captures live memory into the snapshot (.vmsn). Most expensive option per snapshot; the RAM content is stored in full plus ~100 MB of paging overhead." title="Memory-state snapshot">
                Capture memory state (.vmsn) <InfoDot />
              </Tip>
            }
            sub={`Adds ~RAM + ${fmt(POLICY.memoryStateOverheadGB * 1024, 0)} MB to the snapshot footprint.`}
          />
        </div>
      </Card>

      {/* results (live) */}
      <div className="flex flex-col" style={{ gap: 16 }}>
        {!done ? (
          <Card className="min-h-[420px]">
            <EmptyState
              icon={<Camera size={28} strokeWidth={1.7} />}
              title="Snapshot footprint appears here — live"
              body="Enter a change rate and a retention window: the model computes delta growth × safety factor, capped at the provisioned disk, plus an optional memory-state block. The result is the demand figure you carry into capacity planning."
            >
              <Chip tone="gold">A delta can never outgrow its base disk</Chip>
            </EmptyState>
          </Card>
        ) : (
          <>
            <Card title="Snapshot footprint" right={<LiveBadge />}>
              <div className="flex items-end flex-wrap" style={{ gap: 18 }}>
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--text-4)" }}>
                    <Tip tip="Total space this snapshot chain will consume at the end of its retention window — delta growth plus memory state if captured. Carry this into the Multi-VM Planner per VM." title="Total footprint">
                      Total footprint <InfoDot />
                    </Tip>
                  </div>
                  <div className="font-num" style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-1px", color: "var(--gold)", lineHeight: 1.05, marginTop: 6 }}>
                    <AnimatedValue value={done.total} format={(n) => smartUnit(n)} />
                  </div>
                </div>
                <div className="flex flex-wrap" style={{ gap: 6, marginLeft: "auto" }}>
                  {UNITS.map((u) => (
                    <Chip key={u} tip={`Total footprint in ${u}.`}>{u}: {fmt(allUnits(done.total)[u], 2)}</Chip>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <ResultRow label="Daily write rate" tip="Net changed blocks per day feeding the delta file." value={`${fmt(done.dwr, 2)} GB/day`} />
                <ResultRow label="Retention window" tip={`Days the chain lives before consolidation. Guideline: ≤ ${POLICY.maxSnapshotAgeDays}d.`} value={`${done.days} day(s)`} tone={agedRetention ? "warning" : undefined} />
                <ResultRow label="Safety factor" tip="Spike headroom multiplier on the raw growth." value={`${done.sf}×`} />
                <ResultRow
                  label="Delta growth (raw)" value={`${fmt(done.deltaRaw)} GB`}
                  tip="Write rate × days × safety factor — before the provisioned-size cap."
                />
                {done.capGB > 0 && (
                  <ResultRow
                    label="Provisioned-size cap" value={`${fmt(done.capGB)} GB`}
                    tip="A delta file can never exceed its base disk. When raw growth passes this line the estimate is clamped — but real chains usually reach this state via consolidation failures, so treat saturation as an emergency."
                    tone={done.capped ? "danger" : undefined}
                  />
                )}
                <ResultRow
                  label="Delta growth (applied)" value={`${fmt(done.delta)} GB`}
                  tip="The delta size actually reserved — raw growth, or the provisioned size when capped."
                  tone={done.capped ? "danger" : undefined}
                />
                {done.mem && (
                  <ResultRow label="Memory state (.vmsn)" tip="RAM + ~100 MB paging overhead written when the snapshot captures live memory." value={`${fmt(done.memSize)} GB`} />
                )}
                <ResultRow label="Total footprint" tip="Delta + memory state. This is the number to budget per VM." strong tone="gold" value={smartUnit(done.total)} />
              </div>

              {done.capGB > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-2)" }}>
                    <Tip tip="Delta size as a share of the base disk. Approaching 100% means the chain is saturating the disk — consolidation becomes slow and risky; act before it reaches ~90%." title="Delta saturation">
                      Delta saturation <InfoDot />
                    </Tip>
                  </div>
                  <Meter
                    pct={capPct}
                    sev={capPct >= 90 ? "danger" : capPct >= 60 ? "warning" : "success"}
                    markerPct={90}
                    left={`${fmt(capPct, 1)}% of the ${fmt(done.capGB)} GB base disk`}
                    right={done.capped ? "CAPPED at provisioned size" : "headroom remains"}
                  />
                </div>
              )}
            </Card>

            {agedRetention && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <InfoBanner sev="warning" icon={<AlarmClockCheck size={18} />} title={`Retention above the ${POLICY.maxSnapshotAgeDays}-day guideline`}>
                  Chains older than {POLICY.maxSnapshotAgeDays} days accumulate large deltas and consolidate with a noticeable guest stun
                  (especially under write load). Commit or roll back within the guideline, or re-plan the window with the Multi-VM Planner.
                </InfoBanner>
              </motion.div>
            )}
            {done.capped && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <InfoBanner sev="danger" icon={<TrendingUp size={18} />} title="Delta would saturate the base disk">
                  Projected growth exceeds the provisioned size — the estimate was clamped. In practice a chain in this state comes from
                  uncontrolled growth or failed consolidation: shorten retention or expand the underlying datastore before proceeding.
                </InfoBanner>
              </motion.div>
            )}
            {!agedRetention && !done.capped && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <InfoBanner sev="success" icon={<Layers size={18} />} title="Within operational guidelines">
                  Retention and delta size are healthy. Confirm the datastore has at least {smartUnit(done.total)} of true free headroom
                  (after the {POLICY.freeSpace.approvedPct}% policy reservation) before taking the snapshot.
                </InfoBanner>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* small local numeric input with label + tip (keeps this tab compact) */
function NumLikeInput({
  label, tip, value, onChange, step = "any",
}: {
  label: string; tip: string; value: string; onChange: (v: string) => void; step?: string | number;
}) {
  return (
    <div>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 700, color: "var(--text-3)", marginBottom: 7 }}>
        <Tip tip={tip} title={label}>
          {label}
          <InfoDot />
        </Tip>
      </label>
      <input
        type="number" inputMode="decimal" min={0} step={step} value={value}
        onChange={(e) => onChange(e.target.value)}
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
