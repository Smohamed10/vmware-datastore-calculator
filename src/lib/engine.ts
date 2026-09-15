/**
 * VCapacity calculation engine — merged, typed, unit-tested.
 * Supersedes the legacy duplicated `calculations.js` / `engine.js` pair.
 */
import { POLICY } from "../config/policy";

export type Unit = "KB" | "MB" | "GB" | "TB" | "PB";
export interface UnitValue {
  v: string;
  u: Unit;
}

const K = 1024;
const MULT: Record<Unit, number> = { KB: 1, MB: K, GB: K * K, TB: K ** 3, PB: K ** 4 };
export const UNITS: Unit[] = ["KB", "MB", "GB", "TB", "PB"];

export function toGB(value: number | string, unit: Unit): number {
  const v = typeof value === "string" ? parseFloat(value) : value;
  if (!v || isNaN(v) || v < 0) return 0;
  return (v * (MULT[unit] ?? MULT.GB)) / MULT.GB;
}

export function fromGB(gb: number, unit: Unit): number {
  if (!gb || isNaN(gb)) return 0;
  return (gb * MULT.GB) / (MULT[unit] ?? MULT.GB);
}

export function allUnits(gb: number): Record<Unit, number> {
  return {
    KB: fromGB(gb, "KB"),
    MB: fromGB(gb, "MB"),
    GB: gb,
    TB: fromGB(gb, "TB"),
    PB: fromGB(gb, "PB"),
  };
}

export function fmt(v: number | null | undefined, d = 2): string {
  if (v === null || v === undefined || isNaN(v)) return "—";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (abs >= 1e4) return v.toLocaleString("en-US", { maximumFractionDigits: d });
  if (abs >= 100) return (+v.toFixed(Math.min(d, 2))).toString();
  if (abs >= 1) return (+v.toFixed(d)).toString();
  if (abs >= 0.001) return (+v.toFixed(Math.max(d, 4))).toString();
  return v.toExponential(2);
}

export function smartUnit(gb: number): string {
  if (gb <= 0) return "0 GB";
  if (gb >= K) return fmt(gb / K, 3) + " TB";
  if (gb >= 1) return fmt(gb, 2) + " GB";
  if (gb >= 1 / K) return fmt(gb * K, 2) + " MB";
  return fmt(gb * K * K, 0) + " KB";
}

/** Rounds and returns a machine-safe numeric string ("17367.8", never
 *  "17,367.8"). Feeding fmt() output into <input type="number"> is a bug —
 *  locale commas make the field invalid and silently truncate the value.
 *  Use num() whenever a computed number lands back in an input. */
export function num(n: number, d = 2): string {
  if (isNaN(n)) return "";
  const r = +n.toFixed(d);
  return Object.is(r, -0) ? "0" : String(r);
}

/* ── Datastore sizing ──────────────────────────────────────── */

export interface DatastoreResult {
  usedGB: number;
  ramGB: number; // effective (doubled when memory snapshot included)
  origRamGB: number;
  snapGB: number;
  raw: number;
  required: number;
  padding: number;
  bufferPct: number;
  memSnap: boolean;
}

export function calcDatastore(p: {
  usedGB: number;
  ramGB: number;
  snapGB: number;
  buffer?: number;
  memSnap?: boolean;
}): DatastoreResult {
  const buffer = p.buffer ?? POLICY.safetyBuffer;
  const memSnap = p.memSnap ?? false;
  const effRam = memSnap ? p.ramGB * 2 : p.ramGB;
  const raw = p.usedGB + effRam + p.snapGB;
  const required = raw * buffer;
  return {
    usedGB: p.usedGB,
    ramGB: effRam,
    origRamGB: p.ramGB,
    snapGB: p.snapGB,
    raw,
    required,
    padding: required - raw,
    bufferPct: (buffer - 1) * 100,
    memSnap,
  };
}

/* ── Health / governance assessment ────────────────────────── */

export type Severity = "success" | "warning" | "danger";

export interface HealthStatus {
  totalGB: number;
  freeGB: number;
  usedGB: number;
  freePct: number;
  usedPct: number;
  /** Snapshot demand assumed to land on the datastore at peak. */
  demandGB: number;
  projectedFreeGB: number;
  projectedFreePct: number;
  /** True when current free space passes policy but peak snapshot
   *  consumption would push the datastore below the approved line. */
  breachAtPeak: boolean;
  sev: Severity;
  status: "APPROVED" | "WARNING" | "CRITICAL";
  msg: string;
  snapAuthorized: boolean;
  sufficient: boolean;
  gapGB: number;
}

export function calcHealth(
  totalGB: number,
  freeGB: number,
  requiredGB: number,
  demandGB: number
): HealthStatus | null {
  if (totalGB <= 0) return null;

  const { approvedPct, warningPct } = POLICY.freeSpace;
  const usedGB = totalGB - freeGB;
  const freePct = (freeGB / totalGB) * 100;
  const usedPct = (usedGB / totalGB) * 100;
  const projectedFreeGB = freeGB - demandGB;
  const projectedFreePct = (projectedFreeGB / totalGB) * 100;

  let sev: Severity, status: HealthStatus["status"], msg: string;

  if (freePct >= approvedPct) {
    sev = "success";
    status = "APPROVED";
    msg = `Free space at ${freePct.toFixed(1)}% meets the policy threshold of ${approvedPct}%. Performance headroom is adequate and snapshot operations can be accommodated.`;
  } else if (freePct >= warningPct) {
    sev = "warning";
    status = "WARNING";
    msg = `Free space at ${freePct.toFixed(1)}% is below the ${approvedPct}% policy threshold. Snapshot operations carry elevated risk — coordinate with the Storage Team before proceeding.`;
  } else {
    sev = "danger";
    status = "CRITICAL";
    msg = `Free space at ${freePct.toFixed(1)}% is below the ${warningPct}% danger line. Snapshot operations must not be performed; capacity expansion is required.`;
  }

  const breachAtPeak = freePct >= approvedPct && projectedFreePct < approvedPct;
  const snapAuthorized = freePct >= approvedPct && projectedFreePct >= warningPct;
  const sufficient = totalGB >= requiredGB;

  return {
    totalGB,
    freeGB,
    usedGB,
    freePct: +freePct.toFixed(2),
    usedPct: +usedPct.toFixed(2),
    demandGB,
    projectedFreeGB: +projectedFreeGB.toFixed(2),
    projectedFreePct: +projectedFreePct.toFixed(2),
    breachAtPeak,
    sev,
    status,
    msg,
    snapAuthorized,
    sufficient,
    gapGB: sufficient ? 0 : +(requiredGB - totalGB).toFixed(2),
  };
}

/* ── Snapshot sizing ───────────────────────────────────────── */

/** Convert sustained write throughput (KB/s) into daily delta (GB/day). */
export function calcDWR(kbps: number | string): number {
  const v = typeof kbps === "string" ? parseFloat(kbps) : kbps;
  if (!v || isNaN(v) || v <= 0) return 0;
  return v * POLICY.kbsToGbPerDay;
}

export interface SnapshotResult {
  dwr: number;
  days: number;
  sf: number;
  deltaRaw: number;
  delta: number;
  memSize: number;
  total: number;
  mem: boolean;
  capped: boolean;
  capGB: number;
}

export function calcSnapshot(p: {
  dwr: number;
  days?: number;
  sf?: number;
  mem?: boolean;
  ramGB?: number;
  /** Provisioned size of the base disk — a delta file can never grow
   *  past its base, so the estimate is capped at this value when set. */
  capGB?: number;
}): SnapshotResult {
  const days = p.days ?? 7;
  const sf = p.sf ?? POLICY.snapshotSafetyFactor;
  const mem = p.mem ?? false;

  const deltaRaw = p.dwr * days * sf;
  const capGB = p.capGB && p.capGB > 0 ? p.capGB : 0;
  const capped = capGB > 0 && deltaRaw > capGB;
  const delta = capped ? capGB : deltaRaw;
  const memSize = mem ? (p.ramGB ?? 0) + POLICY.memoryStateOverheadGB : 0;

  return { dwr: p.dwr, days, sf, deltaRaw, delta, memSize, total: delta + memSize, mem, capped, capGB };
}
