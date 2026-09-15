/**
 * ─────────────────────────────────────────────────────────────
 *  POLICY & FORMULA CONSTANTS — single source of truth
 * ─────────────────────────────────────────────────────────────
 *  Every sizing policy value lives here, versioned and cited.
 *  Changes to these values must go through change management and
 *  bump APP.formulaVersion so historical reports stay interpretable.
 */

export const POLICY = {
  /** Snapshot overhead reserve as a fraction of datastore capacity.
   *  Agreed standard with the Storage Team (flat heuristic — superseded
   *  by per-VM demand analysis when write-rate data is available). */
  overheadPercent: 0.1,

  /** Safety buffer multiplier on the raw sizing sum.
   *  VMware-recommended headroom; maintains ~20–25% free space. */
  safetyBuffer: 1.25,

  /** Buffers above this multiplier trigger a plausibility warning. */
  bufferWarningAbove: 2.0,

  /** Free-space governance thresholds (percent of total capacity).
   *  ≥ approved  → snapshot operations authorized
   *  ≥ warning   → elevated risk, coordinate with Storage Team
   *  < warning   → snapshot operations denied                     */
  freeSpace: { approvedPct: 25, warningPct: 15 },

  /** Safety factor applied to snapshot delta growth (spike headroom). */
  snapshotSafetyFactor: 1.2,

  /** KB/s → GB/day conversion: KB/s × 86,400 s/day ÷ 1,048,576 KB/GB.
   *  (≈ 0.082397 GB/day per KB/s of sustained write throughput.) */
  kbsToGbPerDay: 86_400 / 1_048_576,

  /** Fixed overhead added to a memory-state snapshot (.vmsn + paging). */
  memoryStateOverheadGB: 100 / 1024,

  /** Operational guidance: snapshots older than this (days) should be
   *  committed or rolled back — consolidation stun risk rises sharply,
   *  especially for high-I/O workloads. */
  maxSnapshotAgeDays: 3,
} as const;

export const APP = {
  name: "VCapacity",
  version: "2.0",
  /** Bumped whenever any formula or policy value changes. Printed on
   *  every exported report so results stay auditable over time.
   *  (v2.0 adds NAA/LUN reporting, the hover knowledge layer, the
   *  Capacity-tab RVTools import and the planner's required-increase
   *  model — the underlying formulas are unchanged.) */
  formulaVersion: "VC-FML-2026.1",
  orgLine1: "QNB · Technology Operations",
  orgLine2: "Cloud & Platform Services",
  classification: "CONFIDENTIAL — INTERNAL USE ONLY",
} as const;
