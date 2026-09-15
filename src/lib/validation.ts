/**
 * Input pre-check engine — the plausibility layer that runs live as the
 * user types and again, authoritatively, before any calculation.
 * Pure function: same inputs → same verdicts, which is why it is unit-testable.
 */
import { toGB, fmt, type UnitValue } from "./engine";

export interface PreCheckParams {
  used: UnitValue;
  ram: UnitValue;
  dsCap: UnitValue;
  snap: UnitValue;
  curTot: UnitValue;
  curFree: UnitValue;
  buf: string;
  memSnap: boolean;
}

export interface FieldError {
  field: string;
  msg: string;
}

export interface PreCheckResult {
  errors: FieldError[];
  warnings: string[];
}

export function runPreChecks(params: PreCheckParams): PreCheckResult {
  const errors: FieldError[] = [];
  const warnings: string[] = [];

  const usedGB = toGB(params.used.v, params.used.u);
  const ramGB = toGB(params.ram.v, params.ram.u);
  const snapGB = toGB(params.snap.v, params.snap.u);
  const dsCapGB = toGB(params.dsCap.v, params.dsCap.u);
  const curTotGB = toGB(params.curTot.v, params.curTot.u);
  const curFreeGB = toGB(params.curFree.v, params.curFree.u);
  const buffer = parseFloat(params.buf) || 0;

  /* ── hard requirements ── */
  if (!params.used.v || parseFloat(params.used.v) <= 0) {
    errors.push({ field: "used", msg: "Used space is required and must be greater than 0" });
  }
  if (!params.dsCap.v || parseFloat(params.dsCap.v) <= 0) {
    errors.push({ field: "dsCap", msg: "Datastore capacity is required — it drives the policy overhead reserve" });
  }
  if (!params.buf || buffer < 1) {
    errors.push({ field: "buf", msg: "Buffer must be at least 1.0" });
  }

  /* ── logical consistency ── */
  if (curTotGB > 0 && usedGB > curTotGB) {
    errors.push({
      field: "used",
      msg: `Used space (${fmt(usedGB)} GB) exceeds the datastore capacity (${fmt(curTotGB)} GB). Check values and units.`,
    });
  }
  if (curTotGB > 0 && curFreeGB > curTotGB) {
    errors.push({
      field: "curFree",
      msg: `Free space (${fmt(curFreeGB)} GB) cannot exceed total capacity (${fmt(curTotGB)} GB)`,
    });
  }
  if (parseFloat(params.ram?.v || "0") < 0) errors.push({ field: "ram", msg: "RAM cannot be negative" });
  if (parseFloat(params.used?.v || "0") < 0) errors.push({ field: "used", msg: "Used space cannot be negative" });
  if (parseFloat(params.curFree?.v || "0") < 0)
    errors.push({ field: "curFree", msg: "Free space cannot be negative" });
  if (parseFloat(params.curTot?.v || "0") < 0) errors.push({ field: "curTot", msg: "Capacity cannot be negative" });
  if (params.ram.u === "PB" && params.ram.v) {
    errors.push({ field: "ram", msg: "VM RAM in PB is not realistic. Check the unit." });
  }

  if (errors.length > 0) return { errors, warnings };

  /* ── plausibility warnings ── */
  if (buffer > 2) {
    warnings.push(`Buffer is ${buffer}x — unusually high. Policy default is 1.25x. Confirm intent.`);
  }
  if (usedGB > 100_000) {
    warnings.push(
      `Used space converts to ${fmt(usedGB)} GB (${fmt(usedGB / 1024, 2)} TB). This is very large — verify the unit.`
    );
  }
  if (params.used.u === "GB" && parseFloat(params.used.v) > 0 && parseFloat(params.used.v) < 0.5) {
    warnings.push(`Used space is ${params.used.v} GB (under 0.5 GB). Did you mean MB?`);
  }
  if (usedGB > 0 && usedGB < 0.01) {
    warnings.push(`Used space is extremely small (${fmt(usedGB, 6)} GB). Check the unit selection.`);
  }
  if (params.ram.u === "TB" && parseFloat(params.ram.v) > 0) {
    warnings.push(`VM RAM is set to ${params.ram.v} TB — RAM is usually measured in GB. Verify the unit.`);
  }
  if (ramGB > usedGB && usedGB > 0) {
    warnings.push(
      `VM RAM (${fmt(ramGB)} GB) exceeds used space (${fmt(usedGB)} GB). Uncommon — verify the values.`
    );
  }
  if (dsCapGB > 0 && snapGB > dsCapGB * 0.5) {
    warnings.push(
      `Snapshot overhead (${fmt(snapGB)} GB) exceeds 50% of datastore capacity (${fmt(dsCapGB)} GB). The policy standard is 10%.`
    );
  }
  if (dsCapGB > 0 && usedGB > dsCapGB) {
    warnings.push(
      `Used space (${fmt(usedGB)} GB) exceeds datastore capacity (${fmt(dsCapGB)} GB) — thin provisioning or a unit mismatch.`
    );
  }
  if (curTotGB > 0 && curFreeGB > 0) {
    const computedUsed = curTotGB - curFreeGB;
    if (usedGB > 0 && computedUsed > 0 && Math.abs(usedGB - computedUsed) > computedUsed * 0.5) {
      warnings.push(
        `Entered used space (${fmt(usedGB)} GB) differs significantly from computed used (${fmt(computedUsed)} GB = capacity minus free). Double-check inputs.`
      );
    }
    if (usedGB + curFreeGB > curTotGB * 1.1) {
      warnings.push(
        `Used (${fmt(usedGB)} GB) + Free (${fmt(curFreeGB)} GB) exceeds total capacity (${fmt(curTotGB)} GB). Verify inputs.`
      );
    }
  }
  if (curFreeGB > 0 && snapGB >= curFreeGB) {
    warnings.push(
      `Snapshot overhead (${fmt(snapGB)} GB) would consume the entire current free space (${fmt(curFreeGB)} GB). Peak consumption will breach policy.`
    );
  }
  if (params.memSnap && usedGB > 0 && ramGB * 2 > usedGB) {
    warnings.push(
      `With memory snapshot enabled, effective RAM (${fmt(ramGB * 2)} GB) exceeds used space (${fmt(usedGB)} GB). Confirm the RAM value.`
    );
  }

  return { errors, warnings };
}
