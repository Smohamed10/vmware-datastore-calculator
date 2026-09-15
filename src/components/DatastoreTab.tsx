import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { AlertTriangle, Building2, Database, FileDown, Server } from "lucide-react";
import { APP, POLICY } from "../config/policy";
import {
  allUnits, calcDatastore, calcHealth, fmt, toGB,
  type DatastoreResult, type HealthStatus, type Severity, type Unit, type UnitValue,
} from "../lib/engine";
import { usePersistentState } from "../lib/persist";
import { nextReportRef } from "../lib/reportRef";
import { runPreChecks } from "../lib/validation";
import { BigResult, CalcButton, Card, Field, Progress, Row, SectionLabel, StatusPanel, Toggle, UnitsGrid } from "./ui";

const UV = (u: Unit = "GB"): UnitValue => ({ v: "", u });
const EMPTY_CHECKS: { errors: never[]; warnings: string[] } = { errors: [], warnings: [] };

/** Overhead reserve derived from capacity under policy (unit-smart). */
function deriveOverhead(capGB: number): UnitValue {
  const o = capGB * POLICY.overheadPercent;
  if (o <= 0) return UV();
  if (o >= 1024) return { v: (o / 1024).toFixed(4), u: "TB" };
  if (o < 0.001) return { v: (o * 1024 * 1024).toFixed(4), u: "KB" };
  if (o < 1) return { v: (o * 1024).toFixed(4), u: "MB" };
  return { v: o.toFixed(4), u: "GB" };
}

export default function DatastoreTab() {
  const [dsName, setDsName] = usePersistentState("ds.name", "");
  const [cluster, setCluster] = usePersistentState("ds.cluster", "");
  const [used, setUsed] = usePersistentState<UnitValue>("ds.used", UV());
  const [ram, setRam] = usePersistentState<UnitValue>("ds.ram", UV());
  const [dsCap, setDsCap] = usePersistentState<UnitValue>("ds.cap", UV("TB"));
  const [snap, setSnap] = usePersistentState<UnitValue>("ds.snap", UV());
  const [buf, setBuf] = usePersistentState("ds.buf", String(POLICY.safetyBuffer));
  const [curTot, setCurTot] = usePersistentState<UnitValue>("ds.curTot", UV("TB"));
  const [curFree, setCurFree] = usePersistentState<UnitValue>("ds.curFree", UV());
  const [memSnap, setMemSnap] = usePersistentState("ds.memSnap", false);
  const [overridden, setOverridden] = usePersistentState("ds.overridden", false);

  const [result, setResult] = useState<DatastoreResult | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);

  /* Policy-derived overhead — follows capacity until the user overrides it.
     An override is never silently destroyed by a capacity change. */
  useEffect(() => {
    if (overridden) return;
    setSnap(deriveOverhead(toGB(dsCap.v, dsCap.u)));
  }, [dsCap.v, dsCap.u, overridden, setSnap]);

  function editSnap(v: string) {
    setSnap({ v, u: snap.u });
    setOverridden(true);
    setFieldErrors({});
  }
  function resetSnap() {
    setOverridden(false); // effect recomputes the policy value
  }

  const preChecks = useMemo(() => {
    const any = used.v || ram.v || dsCap.v || curTot.v || curFree.v;
    if (!any) return EMPTY_CHECKS;
    return runPreChecks({ used, ram, dsCap, snap, curTot, curFree, buf, memSnap });
  }, [used, ram, dsCap, snap, curTot, curFree, buf, memSnap]);

  const livePreview = useMemo(() => {
    const u = toGB(used.v, used.u);
    const r = toGB(ram.v, ram.u);
    const sn = toGB(snap.v, snap.u);
    if (u <= 0 && r <= 0 && sn <= 0) return null;
    return fmt((u + (memSnap ? r * 2 : r) + sn) * (parseFloat(buf) || POLICY.safetyBuffer), 2);
  }, [used, ram, snap, buf, memSnap]);

  function calculate() {
    const check = runPreChecks({ used, ram, dsCap, snap, curTot, curFree, buf, memSnap });

    const fErrs: Record<string, string> = {};
    check.errors.forEach((e) => {
      if (e.field) fErrs[e.field] = e.msg;
    });
    setFieldErrors(fErrs);

    if (check.errors.length > 0) {
      toast.error("Resolve the highlighted fields to continue");
      return;
    }
    check.warnings.slice(0, 3).forEach((w) =>
      toast(w, {
        icon: <AlertTriangle size={15} color="#F59E0B" />,
        duration: 6000,
        style: { maxWidth: 480, fontSize: 13 },
      })
    );

    const ds = calcDatastore({
      usedGB: toGB(used.v, used.u),
      ramGB: toGB(ram.v, ram.u),
      snapGB: toGB(snap.v, snap.u),
      buffer: parseFloat(buf) || POLICY.safetyBuffer,
      memSnap,
    });
    setResult(ds);

    const ctGB = toGB(curTot.v, curTot.u);
    setHealth(ctGB > 0 ? calcHealth(ctGB, toGB(curFree.v, curFree.u), ds.required, toGB(snap.v, snap.u)) : null);
  }

  /* ── Canvas report render ─────────────────────────────────── */
  function exportReport() {
    if (!result) {
      toast.error("Run the calculation first");
      return;
    }
    if (!health) {
      toast.error("Enter current capacity and free space to generate a report");
      return;
    }
    setExporting(true);
    try {
      const ref = nextReportRef("VCA");
      const isDark = document.documentElement.getAttribute("data-theme") !== "light";
      const units = allUnits(result.required);

      const W = 1240;
      const H = 1120;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d")!;

      const C = isDark
        ? { bg: "#070A12", card: "#0D1322", card2: "#131A2E", border: "#1E2640", t0: "#FFFFFF", t1: "#EDEFF7", t2: "#B9C1D9", t3: "#8A94B0", t4: "#5A647E", bar: "#1A2035" }
        : { bg: "#F2F4F8", card: "#FFFFFF", card2: "#F3F5FB", border: "#D9DEE9", t0: "#0E1220", t1: "#1C2236", t2: "#3A4160", t3: "#5C6580", t4: "#8890A8", bar: "#E3E7EF" };
      const gold = isDark ? "#C9A84C" : "#A8842F";
      const maroon = isDark ? "#7A1B37" : "#6D1932";
      const sevColor: Record<Severity, string> = { success: "#22C55E", warning: "#F59E0B", danger: "#EF4444" };
      const sc = sevColor[health.sev];
      const projSev: Severity =
        health.projectedFreePct >= POLICY.freeSpace.approvedPct
          ? "success"
          : health.projectedFreePct >= POLICY.freeSpace.warningPct
            ? "warning"
            : "danger";
      const psc = sevColor[projSev];

      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      /* header */
      const strip = ctx.createLinearGradient(0, 0, W, 0);
      strip.addColorStop(0, maroon);
      strip.addColorStop(1, gold);
      ctx.fillStyle = strip;
      ctx.fillRect(0, 0, W, 6);
      ctx.fillStyle = C.card;
      ctx.fillRect(0, 6, W, 110);
      ctx.fillStyle = C.border;
      ctx.fillRect(0, 115, W, 1);
      ctx.fillStyle = gold;
      ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
      ctx.fillText("Datastore Capacity Assessment", 44, 58);
      ctx.fillStyle = C.t3;
      ctx.font = '14px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`${APP.orgLine1}  ·  ${APP.orgLine2}`, 44, 86);
      ctx.textAlign = "right";
      ctx.fillStyle = C.t4;
      ctx.font = 'bold 14px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(ref, W - 44, 52);
      ctx.font = '13px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(new Date().toLocaleString(), W - 44, 76);
      ctx.fillStyle = isDark ? "#C4757F" : "#8E2438";
      ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
      ctx.fillText(APP.classification, W - 44, 98);
      ctx.textAlign = "left";

      /* identity band */
      const iY = 132;
      chip(ctx, 44, iY, "DATASTORE", dsName || "—", C, gold);
      chip(ctx, 44 + 420, iY, "CLUSTER / VCENTER", cluster || "—", C, gold);
      ctx.textAlign = "right";
      ctx.fillStyle = C.t4;
      ctx.font = '12px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`${APP.name} v${APP.version}`, W - 44, iY + 30);
      ctx.textAlign = "left";

      /* status box */
      const sY = 208;
      ctx.fillStyle = sc + (isDark ? "18" : "12");
      rr(ctx, 44, sY, W - 88, 100, 16);
      ctx.fill();
      ctx.strokeStyle = sc + "55";
      ctx.lineWidth = 2;
      rr(ctx, 44, sY, W - 88, 100, 16);
      ctx.stroke();
      ctx.fillStyle = sc;
      ctx.font = 'bold 24px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`STATUS: ${health.status}`, 70, sY + 40);
      ctx.fillStyle = C.t2;
      ctx.font = '14px "Segoe UI", Arial, sans-serif';
      wt(ctx, health.msg, 70, sY + 66, W - 160, 20);

      /* metric tiles */
      const mY = 328;
      const mets = [
        { l: "FREE SPACE NOW", v: `${health.freePct}%`, c: sc },
        { l: "PROJECTED FREE AT PEAK", v: `${health.projectedFreePct}%`, c: psc },
        { l: "FREE", v: `${fmt(health.freeGB, 2)} GB`, c: C.t1 },
        { l: "TOTAL", v: `${fmt(health.totalGB, 2)} GB`, c: C.t1 },
      ];
      const mw = (W - 88 - 30) / 4;
      mets.forEach((m, i) => {
        const x = 44 + i * (mw + 10);
        ctx.fillStyle = C.card2;
        rr(ctx, x, mY, mw, 84, 12);
        ctx.fill();
        ctx.strokeStyle = C.border;
        ctx.lineWidth = 1;
        rr(ctx, x, mY, mw, 84, 12);
        ctx.stroke();
        ctx.fillStyle = C.t4;
        ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
        ctx.fillText(m.l, x + 16, mY + 26);
        ctx.fillStyle = m.c;
        ctx.font = 'bold 23px "Segoe UI", Arial, sans-serif';
        ctx.fillText(m.v, x + 16, mY + 60);
      });

      /* bars */
      const bY = 446;
      ctx.fillStyle = C.t4;
      ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
      ctx.fillText("CURRENT UTILIZATION", 44, bY - 10);
      ctx.fillText(`POLICY LINE — ${POLICY.freeSpace.approvedPct}% FREE`, W / 2 + 176, bY - 10);
      bar(ctx, 44, bY, W - 88, 13, health.usedPct, sc, C.bar);
      marker(ctx, 44, bY, W - 88, 13, 100 - POLICY.freeSpace.approvedPct, C.t4);

      const pY = bY + 46;
      ctx.fillStyle = C.t4;
      ctx.fillText("PROJECTED FREE SPACE AT PEAK SNAPSHOT CONSUMPTION", 44, pY - 10);
      bar(ctx, 44, pY, W - 88, 13, Math.max(health.projectedFreePct, 0), psc, C.bar);
      marker(ctx, 44, pY, W - 88, 13, POLICY.freeSpace.approvedPct, C.t4);
      ctx.fillStyle = C.t3;
      ctx.font = '12px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(
        `peak snapshot demand ${fmt(health.demandGB, 2)} GB  →  projected free ${fmt(health.projectedFreeGB, 2)} GB (${health.projectedFreePct}%)`,
        44,
        pY + 32
      );

      /* sizing breakdown */
      const tY = 560;
      ctx.fillStyle = gold;
      ctx.font = 'bold 18px "Segoe UI", Arial, sans-serif';
      ctx.fillText("Sizing Breakdown", 44, tY);
      const rows: [string, string][] = [
        ["Datastore Used", `${fmt(result.usedGB, 2)} GB`],
        [`VM RAM${result.memSnap ? " (×2 — memory state)" : ""}`, `${fmt(result.ramGB, 2)} GB`],
        [
          `Snapshot Overhead (${overridden ? "manual override" : `${Math.round(POLICY.overheadPercent * 100)}% policy reserve`})`,
          `${fmt(result.snapGB, 2)} GB`,
        ],
        ["Raw Sum", `${fmt(result.raw, 2)} GB`],
        [`Safety Buffer (+${fmt(result.bufferPct, 0)}%)`, `+${fmt(result.padding, 2)} GB`],
      ];
      rows.forEach((r, i) => {
        const y = tY + 30 + i * 30;
        ctx.fillStyle = C.t2;
        ctx.font = '14px "Segoe UI", Arial, sans-serif';
        ctx.fillText(r[0], 64, y);
        ctx.fillStyle = C.t0;
        ctx.font = 'bold 14px "JetBrains Mono", Consolas, monospace';
        ctx.textAlign = "right";
        ctx.fillText(r[1], W / 2 + 80, y);
        ctx.textAlign = "left";
      });

      const rY = tY + 200;
      ctx.fillStyle = maroon + (isDark ? "26" : "0D");
      rr(ctx, 44, rY, W - 88, 86, 14);
      ctx.fill();
      ctx.strokeStyle = gold + (isDark ? "50" : "40");
      ctx.lineWidth = 1.5;
      rr(ctx, 44, rY, W - 88, 86, 14);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.fillStyle = C.t4;
      ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
      ctx.fillText("REQUIRED DATASTORE CAPACITY", W / 2, rY + 24);
      ctx.fillStyle = gold;
      ctx.font = 'bold 32px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(`${fmt(result.required, 2)} GB`, W / 2, rY + 60);
      ctx.fillStyle = C.t3;
      ctx.font = '13px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(`${fmt(units.TB, 4)} TB   ·   ${fmt(units.MB, 0)} MB`, W / 2, rY + 79);
      ctx.textAlign = "left";

      /* decisions */
      const dY = rY + 106;
      const decs = [
        {
          l: "SNAPSHOT AUTHORIZATION",
          v: health.snapAuthorized ? "AUTHORIZED" : "DENIED",
          c: health.snapAuthorized ? sevColor.success : sevColor.danger,
        },
        {
          l: "CAPACITY EXPANSION",
          v: health.sufficient ? "NOT NEEDED" : `REQUIRED  (+${fmt(health.gapGB, 2)} GB)`,
          c: health.sufficient ? sevColor.success : sevColor.danger,
        },
      ];
      const dw = (W - 88 - 10) / 2;
      decs.forEach((d, i) => {
        const x = 44 + i * (dw + 10);
        ctx.fillStyle = d.c + (isDark ? "14" : "0D");
        rr(ctx, x, dY, dw, 62, 12);
        ctx.fill();
        ctx.strokeStyle = d.c + "44";
        ctx.lineWidth = 1;
        rr(ctx, x, dY, dw, 62, 12);
        ctx.stroke();
        ctx.fillStyle = C.t4;
        ctx.font = 'bold 9.5px "Segoe UI", Arial, sans-serif';
        ctx.fillText(d.l, x + 18, dY + 22);
        ctx.fillStyle = d.c;
        ctx.font = 'bold 17px "Segoe UI", Arial, sans-serif';
        ctx.fillText(d.v, x + 18, dY + 46);
      });

      /* assumptions */
      const aY = dY + 80;
      ctx.fillStyle = C.card2;
      rr(ctx, 44, aY, W - 88, 56, 12);
      ctx.fill();
      ctx.strokeStyle = C.border;
      rr(ctx, 44, aY, W - 88, 56, 12);
      ctx.stroke();
      ctx.fillStyle = C.t4;
      ctx.font = 'bold 9.5px "Segoe UI", Arial, sans-serif';
      ctx.fillText("ASSUMPTIONS & POLICY BASIS", 60, aY + 20);
      ctx.fillStyle = C.t3;
      ctx.font = '11.5px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(
        `(used + RAM${result.memSnap ? " ×2" : ""} + overhead) × ${fmt(parseFloat(buf) || POLICY.safetyBuffer, 2)} buffer   ·   overhead ${Math.round(POLICY.overheadPercent * 100)}% of capacity${overridden ? " (overridden)" : ""}   ·   thresholds ${POLICY.freeSpace.approvedPct}/${POLICY.freeSpace.warningPct}% free   ·   ${APP.formulaVersion}`,
        60,
        aY + 40
      );

      /* sign-off */
      const soY = aY + 92;
      const roles = ["Prepared by", "Reviewed by", "Approved by"];
      const colW = (W - 88 - 60) / 3;
      roles.forEach((r, i) => {
        const x = 44 + i * (colW + 30);
        ctx.strokeStyle = C.t4;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, soY + 18);
        ctx.lineTo(x + colW, soY + 18);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.t4;
        ctx.font = 'bold 10px "Segoe UI", Arial, sans-serif';
        ctx.fillText(r.toUpperCase(), x, soY + 38);
        ctx.fillStyle = C.t4;
        ctx.font = '10px "Segoe UI", Arial, sans-serif';
        ctx.fillText("Name / Signature / Date", x, soY + 54);
      });

      /* footer */
      const fY = H - 54;
      ctx.fillStyle = C.card;
      ctx.fillRect(0, fY, W, 54);
      const fStrip = ctx.createLinearGradient(0, fY, W, fY);
      fStrip.addColorStop(0, maroon);
      fStrip.addColorStop(1, gold);
      ctx.fillStyle = fStrip;
      ctx.fillRect(0, fY, W, 3);
      ctx.fillStyle = gold;
      ctx.font = 'bold 12px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`${APP.orgLine1}  ·  ${APP.orgLine2}`, 44, fY + 33);
      ctx.textAlign = "right";
      ctx.fillStyle = C.t4;
      ctx.font = '11px "JetBrains Mono", Consolas, monospace';
      ctx.fillText(`${ref}  ·  ${APP.formulaVersion}`, W - 44, fY + 33);
      ctx.textAlign = "left";

      const link = document.createElement("a");
      link.download = `${(dsName || "datastore").trim().replace(/\s+/g, "-") || "datastore"}-assessment-${ref}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success(`Report ${ref} exported`);
    } finally {
      setExporting(false);
    }
  }

  const units = result ? allUnits(result.required) : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 460px), 1fr))", gap: 22 }}>
      {/* ════════ INPUT ════════ */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card title="Datastore Identity" sub="Carried onto every exported report" accent="var(--maroon)" delay={0}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
            <TextInput label="Datastore Name" value={dsName} onChange={setDsName} placeholder="DS-PROD-CLUS03-LUN07" icon={<Database size={13} />} />
            <TextInput label="Cluster / vCenter" value={cluster} onChange={setCluster} placeholder="PROD-CLUSTER-03" icon={<Building2 size={13} />} />
          </div>
        </Card>

        <Card title="Datastore Used Space" sub="Total consumed storage across all VMs on this datastore" accent="var(--maroon)" delay={0.05}>
          <Field
            label="Total Used Space"
            num="1"
            hint="vCenter → Storage → Datastore → Summary → Used"
            value={used.v}
            onChange={(v) => {
              setUsed({ v, u: used.u });
              setFieldErrors({});
            }}
            unit={used.u}
            onUnit={(u) => setUsed({ v: used.v, u })}
            error={fieldErrors.used}
          />
        </Card>

        <Card title="VM RAM — Swap Reservation" sub="Sum of configured RAM across the VMs on this datastore" accent="var(--blue)" delay={0.1}>
          <Field
            label="Total VM RAM"
            num="2"
            hint="vCenter → VMs → Edit Settings → Memory"
            value={ram.v}
            onChange={(v) => {
              setRam({ v, u: ram.u });
              setFieldErrors({});
            }}
            unit={ram.u}
            onUnit={(u) => setRam({ v: ram.v, u })}
            error={fieldErrors.ram}
          />
          <Toggle
            checked={memSnap}
            onChange={setMemSnap}
            label="Memory-state snapshots"
            sub={memSnap ? "RAM is counted twice — swap reservation plus memory state" : "Reserve additional space for .vmsn memory capture"}
          />
        </Card>

        <Card title="Capacity & Snapshot Reserve" accent="var(--amber)" delay={0.15}>
          <Field
            label="Datastore Total Capacity"
            num="3"
            hint="vCenter → Datastore → Summary → Capacity"
            value={dsCap.v}
            onChange={(v) => setDsCap({ v, u: dsCap.u })}
            unit={dsCap.u}
            onUnit={(u) => setDsCap({ v: dsCap.v, u })}
            error={fieldErrors.dsCap}
          />
          <Field
            label="Snapshot Overhead"
            num="4"
            derived
            derivedNote={`${Math.round(POLICY.overheadPercent * 100)}% policy`}
            overridden={overridden}
            onResetDerived={resetSnap}
            value={snap.v}
            onChange={editSnap}
            unit={snap.u}
            onUnit={(u) => setSnap({ v: snap.v, u })}
            error={fieldErrors.snap}
          />
        </Card>

        <Card title="Safety & Current State" sub="Buffer and live datastore metrics for the health assessment" accent="var(--gold)" delay={0.2}>
          <Field
            label="Safety Buffer"
            num="5"
            hint={`Policy default ${POLICY.safetyBuffer} — maintains ~20–25% free headroom`}
            value={buf}
            onChange={(v) => {
              setBuf(v);
              setFieldErrors({});
            }}
            showUnit={false}
            suffix="× multiplier"
            step="0.05"
            error={fieldErrors.buf}
          />
          <div style={{ height: 1, margin: "14px 0 18px", background: "var(--border-1)" }} />
          <Field
            label="Current Capacity"
            num="6"
            optional
            value={curTot.v}
            onChange={(v) => setCurTot({ v, u: curTot.u })}
            unit={curTot.u}
            onUnit={(u) => setCurTot({ v: curTot.v, u })}
            error={fieldErrors.curTot}
          />
          <Field
            label="Current Free Space"
            num="7"
            optional
            value={curFree.v}
            onChange={(v) => setCurFree({ v, u: curFree.u })}
            unit={curFree.u}
            onUnit={(u) => setCurFree({ v: curFree.v, u })}
            error={fieldErrors.curFree}
          />

          <AnimatePresence>
            {preChecks.warnings.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: "hidden" }}
              >
                {preChecks.warnings.map((w, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-start"
                    style={{
                      gap: 8,
                      padding: "10px 14px",
                      borderRadius: 10,
                      marginBottom: 6,
                      fontSize: 13,
                      lineHeight: 1.6,
                      fontWeight: 500,
                      background: "var(--amber-bg)",
                      color: "var(--amber)",
                      border: "1px solid rgba(245,158,11,0.3)",
                    }}
                  >
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{w}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {livePreview && (
            <div
              className="flex items-center justify-between"
              style={{
                padding: "13px 16px",
                borderRadius: 12,
                marginTop: 4,
                marginBottom: 10,
                background: "var(--maroon-bg)",
                border: "1px solid var(--gold-border)",
              }}
            >
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--text-3)" }}>
                Projected requirement
              </span>
              <span className="font-num shimmer-gold" style={{ fontSize: 20, fontWeight: 800 }}>
                {livePreview} GB
              </span>
            </div>
          )}

          <CalcButton onClick={calculate} label="Calculate required capacity" />
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
                    <Database size={54} style={{ margin: "0 auto", color: "var(--gold)" }} />
                  </motion.div>
                  <p style={{ fontSize: 16.5, fontWeight: 600, color: "var(--text-3)" }}>Awaiting calculation</p>
                  <p style={{ fontSize: 13.5, color: "var(--text-4)", marginTop: 8 }}>Complete the inputs — results render here</p>
                </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div key="res" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <Card title="Capacity Sizing Breakdown" sub="Formula: (Used + RAM + Overhead) × Safety Buffer" accent="var(--green)" delay={0}>
                <Row label="Datastore Used" value={`${fmt(result.usedGB)} GB`} />
                <Row
                  label={result.memSnap ? "VM RAM (×2 — memory state)" : "VM RAM"}
                  value={`${fmt(result.ramGB)} GB`}
                  gold={result.memSnap}
                  badge={result.memSnap ? <NotePill>originally {fmt(result.origRamGB)} GB</NotePill> : undefined}
                />
                <Row
                  label="Snapshot Overhead"
                  value={`${fmt(result.snapGB)} GB`}
                  badge={<NotePill>{overridden ? "manual" : `${Math.round(POLICY.overheadPercent * 100)}% policy`}</NotePill>}
                />
                <Row label="Raw Sum" value={`${fmt(result.raw)} GB`} />
                <Row label={`Safety Buffer (+${fmt(result.bufferPct, 0)}%)`} value={`+${fmt(result.padding)} GB`} />
                <BigResult
                  label="Required Datastore Capacity"
                  value={`${fmt(result.required, 2)} GB`}
                  sub={`${fmt(units!.TB, 4)} TB   ·   ${fmt(units!.MB, 0)} MB`}
                />
                <UnitsGrid units={units!} />
                <div className="font-num" style={{ marginTop: 14, fontSize: 10.5, color: "var(--text-4)", letterSpacing: "0.4px" }}>
                  {Math.round(POLICY.overheadPercent * 100)}% reserve · {fmt(parseFloat(buf) || POLICY.safetyBuffer, 2)}× buffer · {POLICY.freeSpace.approvedPct}/{POLICY.freeSpace.warningPct}% thresholds · {APP.formulaVersion}
                </div>
              </Card>

              {health ? (
                <Card
                  title="Health Assessment"
                  sub="Current and projected-peak evaluation against policy"
                  accent={health.sev === "success" ? "var(--green)" : health.sev === "warning" ? "var(--amber)" : "var(--red)"}
                  glow={health.sev === "danger" ? "rgba(239,68,68,0.05)" : health.sev === "warning" ? "rgba(245,158,11,0.04)" : "rgba(34,197,94,0.03)"}
                  delay={0.08}
                >
                  <StatusPanel sev={health.sev} title={`STATUS: ${health.status}`} detail={health.msg} />

                  <SectionLabel>
                    <span style={{ marginTop: 18, display: "inline-block", marginBottom: 0 }}>Current utilization</span>
                  </SectionLabel>
                  <Progress
                    pct={health.usedPct}
                    sev={health.sev}
                    markerPct={100 - POLICY.freeSpace.approvedPct}
                    showMarkerLabel
                    left={`Used: ${fmt(health.usedGB, 2)} GB (${health.usedPct}%)`}
                    right={`Free: ${fmt(health.freeGB, 2)} GB (${health.freePct}%)`}
                  />

                  <SectionLabel>
                    <span style={{ marginTop: 18, display: "inline-block", marginBottom: 0 }}>Projected free space at peak snapshot</span>
                  </SectionLabel>
                  <Progress
                    pct={Math.max(health.projectedFreePct, 0)}
                    sev={health.projectedFreePct >= POLICY.freeSpace.approvedPct ? "success" : health.projectedFreePct >= POLICY.freeSpace.warningPct ? "warning" : "danger"}
                    markerPct={POLICY.freeSpace.approvedPct}
                    showMarkerLabel
                    left={`Projected: ${fmt(health.projectedFreeGB, 2)} GB (${health.projectedFreePct}%)`}
                    right={`Demand: ${fmt(health.demandGB, 2)} GB`}
                  />

                  <div style={{ marginTop: 20 }}>
                    <SectionLabel>Snapshot Authorization</SectionLabel>
                    <StatusPanel
                      sev={health.snapAuthorized ? "success" : "danger"}
                      title={health.snapAuthorized ? `AUTHORIZED — projected ${health.projectedFreePct}% free at peak` : "DENIED — insufficient margin at peak"}
                      detail={
                        health.snapAuthorized
                          ? health.breachAtPeak
                            ? `Authorized now, but peak consumption drops free space below the ${POLICY.freeSpace.approvedPct}% policy line — schedule consolidation windows and monitor delta growth.`
                            : `Free space holds above policy even at full overhead consumption. Proceed per change management.`
                          : `Peak consumption would leave ${health.projectedFreePct}% free, below the ${POLICY.freeSpace.warningPct}% danger line. Expand capacity before snapshot operations.`
                      }
                    />
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <SectionLabel>Expansion Assessment</SectionLabel>
                    {health.sufficient ? (
                      <StatusPanel
                        sev="success"
                        title="NO EXPANSION NEEDED"
                        detail={`Current capacity of ${fmt(health.totalGB, 2)} GB meets the requirement of ${fmt(result.required, 2)} GB.`}
                      />
                    ) : (
                      <>
                        <StatusPanel sev="danger" title="EXPANSION REQUIRED" />
                        <BigResult danger label="Required Expansion" value={`+${fmt(health.gapGB, 2)} GB`} sub={`${fmt(health.gapGB / 1024, 4)} TB additional capacity needed`} />
                      </>
                    )}
                  </div>

                  <SummaryBox health={health} />

                  <motion.button
                    whileHover={{ scale: 1.015, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={exportReport}
                    disabled={exporting}
                    style={{
                      width: "100%",
                      padding: 15,
                      borderRadius: 14,
                      marginTop: 22,
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
                    {exporting ? "GENERATING…" : "EXPORT ASSESSMENT REPORT"}
                  </motion.button>

                  <div className="flex items-center justify-between flex-wrap" style={{ marginTop: 14, gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.2px", textTransform: "uppercase", color: "var(--gold)" }}>
                      {APP.orgLine1}
                    </span>
                    <span className="font-num" style={{ fontSize: 10.5, color: "var(--text-4)" }}>
                      {APP.classification}
                    </span>
                  </div>
                </Card>
              ) : (
                <Card delay={0.08}>
                  <div className="flex items-start" style={{ gap: 12, padding: "6px 2px" }}>
                    <Server size={18} style={{ color: "var(--text-4)", flexShrink: 0, marginTop: 2 }} />
                    <p style={{ fontSize: 13.5, color: "var(--text-3)", lineHeight: 1.7 }}>
                      Sizing complete. Enter <strong style={{ color: "var(--text-1)" }}>Current Capacity</strong> and{" "}
                      <strong style={{ color: "var(--text-1)" }}>Current Free Space</strong> (fields 6 and 7) to unlock the
                      health assessment and the exportable report.
                    </p>
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

function NotePill({ children }: { children: ReactNode }) {
  return (
    <span
      className="font-num"
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 6,
        background: "var(--bg-3)",
        border: "1px solid var(--border-1)",
        color: "var(--text-4)",
      }}
    >
      {children}
    </span>
  );
}

function SummaryBox({ health }: { health: HealthStatus }) {
  const items = [
    { l: "Status", v: health.status, s: health.sev },
    { l: "Free Space", v: `${health.freePct}%`, s: health.sev },
    { l: "Peak Free", v: `${health.projectedFreePct}%`, s: health.projectedFreePct >= 25 ? ("success" as Severity) : health.projectedFreePct >= 15 ? ("warning" as Severity) : ("danger" as Severity) },
    { l: "Snapshot", v: health.snapAuthorized ? "Authorized" : "Denied", s: health.snapAuthorized ? ("success" as Severity) : ("danger" as Severity) },
    { l: "Expansion", v: health.sufficient ? "Not needed" : `+${fmt(health.gapGB, 2)} GB`, s: health.sufficient ? ("success" as Severity) : ("danger" as Severity) },
  ];
  const c: Record<Severity, string> = { success: "var(--green)", warning: "var(--amber)", danger: "var(--red)" };
  return (
    <div style={{ marginTop: 22, padding: 18, borderRadius: 14, background: "var(--bg-input)", border: "1px solid var(--border-1)" }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase", color: "var(--gold)", marginBottom: 12 }}>
        Cross-Team Summary
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))", gap: 10 }}>
        {items.map((it) => (
          <div key={it.l} style={{ padding: 12, borderRadius: 10, background: "var(--bg-card)", border: "1px solid var(--border-1)" }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 4 }}>{it.l}</div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: c[it.s] }}>{it.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, placeholder, icon }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; icon?: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: "var(--text-4)", marginBottom: 8 }}>{label}</div>
      <div style={{ position: "relative" }}>
        {icon && <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-4)" }}>{icon}</span>}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={label}
          className="font-num"
          style={{
            width: "100%",
            padding: icon ? "12px 14px 12px 36px" : "12px 14px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            outline: "none",
            background: "var(--bg-input)",
            border: "1.5px solid var(--border-2)",
            color: "var(--text-0)",
            transition: "border-color .25s",
          }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--maroon)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-2)")}
        />
      </div>
    </div>
  );
}

/* ── canvas helpers ─────────────────────────────────────────── */

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function wt(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line + words[i] + " ";
    if (ctx.measureText(test).width > maxWidth && i > 0) {
      ctx.fillText(line, x, y);
      line = words[i] + " ";
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y);
}

function chip(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: string, C: Record<string, string>, gold: string) {
  const w = 400;
  const h = 44;
  ctx.fillStyle = C.card2;
  rr(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  rr(ctx, x, y, w, h, 10);
  ctx.stroke();
  ctx.fillStyle = C.t4;
  ctx.font = 'bold 9px "Segoe UI", Arial, sans-serif';
  ctx.fillText(label, x + 14, y + 17);
  ctx.fillStyle = gold;
  ctx.font = 'bold 13.5px "JetBrains Mono", Consolas, monospace';
  ctx.fillText(value.slice(0, 38), x + 14, y + 35);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color: string, track: string) {
  ctx.fillStyle = track;
  rr(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const fw = Math.max(0, Math.min(pct, 100)) / 100;
  if (fw > 0) {
    const g = ctx.createLinearGradient(x, 0, x + w * fw, 0);
    g.addColorStop(0, color + "BB");
    g.addColorStop(1, color);
    ctx.fillStyle = g;
    rr(ctx, x, y, Math.max(w * fw, h), h, h / 2);
    ctx.fill();
  }
}

function marker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + (w * pct) / 100, y - 4);
  ctx.lineTo(x + (w * pct) / 100, y + h + 4);
  ctx.stroke();
}
