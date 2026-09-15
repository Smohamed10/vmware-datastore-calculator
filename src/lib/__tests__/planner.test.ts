/**
 * Multi-VM planner + bulk-assessment golden tests.
 * Run with: npx vitest run
 */
import { describe, expect, it } from "vitest";
import { POLICY } from "../../config/policy";
import { assessRows, parseSizeToGB, reportExpansion, validateRow, type DatastoreInputRow } from "../bulk";
import { computeStats, computeVM, peakWorst, rosterForDatastore, runwayDays, scheduleWindows, type PlannerVM } from "../planner";

const vm = (partial: Partial<PlannerVM>): PlannerVM => ({
  id: partial.id ?? Math.random().toString(36).slice(2),
  name: partial.name ?? "VM",
  provisionedGB: partial.provisionedGB ?? 100,
  ramGB: partial.ramGB ?? 0,
  writeGBDaily: partial.writeGBDaily ?? 0,
  retentionDays: partial.retentionDays ?? 3,
  memSnap: partial.memSnap ?? false,
  spans: partial.spans ?? 1,
});

describe("computeVM", () => {
  it("computes delta = write × retention × safety factor", () => {
    const c = computeVM(vm({ writeGBDaily: 10, retentionDays: 3, provisionedGB: 1000 }));
    expect(c.deltaGB).toBeCloseTo(10 * 3 * POLICY.snapshotSafetyFactor, 6);
    expect(c.capped).toBe(false);
  });

  it("caps delta at provisioned size", () => {
    const c = computeVM(vm({ writeGBDaily: 50, retentionDays: 7, provisionedGB: 100 }));
    expect(c.deltaRawGB).toBeCloseTo(50 * 7 * POLICY.snapshotSafetyFactor, 6);
    expect(c.deltaGB).toBe(100);
    expect(c.capped).toBe(true);
  });

  it("adds memory state when enabled", () => {
    const c = computeVM(vm({ writeGBDaily: 1, ramGB: 64, memSnap: true }));
    expect(c.memStateGB).toBeCloseTo(64 + POLICY.memoryStateOverheadGB, 4);
    expect(c.totalGB).toBeCloseTo(c.deltaGB + c.memStateGB, 6);
  });

  it("raises guardrails for aging retention and saturating deltas", () => {
    const aging = computeVM(vm({ retentionDays: 9, writeGBDaily: 1, provisionedGB: 10000 }));
    expect(aging.guardrails.some((g) => g.msg.includes("exceeds"))).toBe(true);
    const saturating = computeVM(vm({ writeGBDaily: 100, retentionDays: 7, provisionedGB: 100 }));
    expect(saturating.guardrails.some((g) => g.level === "danger")).toBe(true);
  });
});

describe("peak + scheduling", () => {
  it("peakWorst sums all totals", () => {
    const vms = [computeVM(vm({ writeGBDaily: 10 })), computeVM(vm({ writeGBDaily: 20 }))];
    expect(peakWorst(vms)).toBeCloseTo(vms[0].totalGB + vms[1].totalGB, 6);
  });

  it("balances windows under the concurrency cap", () => {
    const vms = [
      { name: "a", totalGB: 10 }, { name: "b", totalGB: 9 }, { name: "c", totalGB: 8 },
      { name: "d", totalGB: 7 }, { name: "e", totalGB: 6 }, { name: "f", totalGB: 5 },
    ];
    const windows = scheduleWindows(vms, 2);
    expect(windows).toHaveLength(3);
    windows.forEach((w) => expect(w.vmNames.length).toBeLessThanOrEqual(2));
    // LPT balance: [10+5], [9+6], [8+7] → every window carries 15 GB
    expect(Math.max(...windows.map((w) => w.demandGB))).toBe(15);
    expect(windows.map((w) => w.demandGB)).toEqual([15, 15, 15]);
  });

  it("one window per VM when concurrency is 1", () => {
    const vms = [{ name: "a", totalGB: 10 }, { name: "b", totalGB: 9 }, { name: "c", totalGB: 8 }];
    expect(scheduleWindows(vms, 1)).toHaveLength(3);
  });

  it("single window when concurrency covers the whole roster", () => {
    const vms = [{ name: "a", totalGB: 10 }, { name: "b", totalGB: 9 }];
    const windows = scheduleWindows(vms, 5);
    expect(windows).toHaveLength(1);
    expect(windows[0].demandGB).toBe(19);
  });
});

describe("stats and runway", () => {
  it("computes used, totals, and required capacity", () => {
    const vms = [
      computeVM(vm({ writeGBDaily: 10, ramGB: 32 })),
      computeVM(vm({ writeGBDaily: 5, ramGB: 16, memSnap: true })),
    ];
    const peak = peakWorst(vms);
    const s = computeStats(2000, 1000, vms, peak, 1.25);
    expect(s.usedGB).toBe(1000);
    expect(s.ramTotalGB).toBe(48);
    expect(s.dailyTotalGB).toBe(15);
    expect(s.requiredGB).toBeCloseTo((1000 + 48 + peak) * 1.25, 6);
  });

  it("runway measures days of aggregate write headroom", () => {
    expect(runwayDays(1000, 400, 50)).toBeCloseTo(12, 6);
    expect(runwayDays(300, 400, 50)!).toBeLessThan(0); // breached at peak
    expect(runwayDays(1000, 400, 0)).toBeNull();
  });
});

describe("rvtools roster building", () => {
  const inv = {
    datastores: [
      { name: "DS-A", capacityGB: 2048, freeGB: 1024 },
      { name: "DS-B", capacityGB: 1024, freeGB: 512 },
    ],
    vms: [
      { name: "VM-1", ramGB: 32, poweredOn: true, disks: [{ datastore: "DS-A", provisionedGB: 200 }] },
      {
        name: "VM-2", ramGB: 64, poweredOn: true,
        disks: [
          { datastore: "DS-A", provisionedGB: 300 },
          { datastore: "DS-B", provisionedGB: 100 },
        ],
      },
    ],
  };

  it("builds a per-datastore roster with spanning detection", () => {
    const rosterA = rosterForDatastore(inv, "DS-A", { changePct: 2, retentionDays: 3 });
    expect(rosterA.map((v) => v.name).sort()).toEqual(["VM-1", "VM-2"]);
    const spanning = rosterA.find((v) => v.name === "VM-2")!;
    expect(spanning.provisionedGB).toBe(300); // only the disks on DS-A
    expect(spanning.spans).toBe(2);
    expect(spanning.writeGBDaily).toBeCloseTo(6, 3); // 2% of 300 GB

    const rosterB = rosterForDatastore(inv, "DS-B", { changePct: 2, retentionDays: 3 });
    expect(rosterB).toHaveLength(1);
    expect(rosterB[0].provisionedGB).toBe(100);
  });
});

describe("parseSizeToGB", () => {
  it("parses numbers, commas, and unit suffixes", () => {
    expect(parseSizeToGB(2048)).toBe(2048);
    expect(parseSizeToGB("1,024.00")).toBe(1024);
    expect(parseSizeToGB("2 TB")).toBe(2048);
    expect(parseSizeToGB("512 MiB")).toBe(0.5);
    expect(parseSizeToGB("abc")).toBeNull();
  });

  it("honors the header unit hint when the value has no unit", () => {
    expect(parseSizeToGB(512, "capacity mib")).toBe(0.5);
    expect(parseSizeToGB(512, "capacity gb")).toBe(512);
  });
});

describe("bulk assessRows", () => {
  const good: DatastoreInputRow = {
    rowNumber: 2, datastore: "DS-1", cluster: "C1", naaLunId: "naa.6000abc",
    capacityGB: 2048, provisionedGB: null, freeGB: 1024, usedGB: null,
    ramGB: 256, memSnap: false, overheadPct: 10, buffer: 1.25, demandGB: null,
  };

  it("computes sizing and health for valid rows", () => {
    const { valid, invalid } = assessRows([good]);
    expect(invalid).toHaveLength(0);
    const r = valid[0];
    expect(r.usedGB).toBe(1024); // inferred capacity − free
    expect(r.provisionedGB).toBe(2048); // falls back to capacity when unknown
    expect(r.reserveGB).toBeCloseTo(204.8, 3);
    // (1024 + 256 + 204.8) × 1.25
    expect(r.requiredGB).toBeCloseTo(1856, 1);
    expect(r.health.status).toBe("APPROVED");
    expect(r.expansionGB).toBe(0);
    expect(r.recommendation).toBe("0 GB");
  });

  it("recommendation is the rounded-up expansion only", () => {
    // capacity 1024, free 512 → used 512 → required (512+256+102.4)×1.25 = 1088 → gap 64
    const small = assessRows([{ ...good, capacityGB: 1024, freeGB: 512 }]).valid[0];
    expect(small.recommendation).toBe("+64 GB");
    // capacity 2048, free 400 → used 1648 → required 2636 → gap 588 (beats the 112 floor gap)
    const lowFree = assessRows([{ ...good, capacityGB: 2048, freeGB: 400 }]).valid[0];
    expect(lowFree.recommendation).toBe("+588 GB");
    // floor-driven: buffer 1.0, no reserve → sizing fits (1748 ≤ 2048) but
    // free 400 GB is below the 512 GB policy floor → expansion = 112
    const floorDriven = assessRows([
      { ...good, buffer: 1.0, overheadPct: 0, ramGB: 100, capacityGB: 2048, freeGB: 400 },
    ]).valid[0];
    expect(floorDriven.health.sufficient).toBe(true);
    expect(floorDriven.recommendation).toBe("+112 GB");
  });

  it("quarantines invalid rows with reasons", () => {
    const { valid, invalid } = assessRows([
      { ...good, freeGB: 3000 },
      { ...good, datastore: "" },
      { ...good, buffer: 0.5 },
    ]);
    expect(valid).toHaveLength(0);
    expect(invalid).toHaveLength(3);
    expect(invalid[0].reasons.some((r) => r.includes("exceeds capacity"))).toBe(true);
    expect(invalid[1].reasons).toContain("missing datastore name");
    expect(invalid[2].reasons.some((r) => r.includes("buffer"))).toBe(true);
  });

  it("validateRow catches negative and out-of-range values", () => {
    expect(validateRow({ ...good, overheadPct: 120 }).length).toBeGreaterThan(0);
    expect(validateRow({ ...good, ramGB: -1 }).length).toBeGreaterThan(0);
    expect(validateRow(good)).toHaveLength(0);
  });
});

describe("report-only requested-increase rules", () => {
  // capacity 1024, free 924 → used 100 → required (100 + 102.4) × 1.25 = 253
  const row = (over: Partial<DatastoreInputRow>): DatastoreInputRow => ({
    rowNumber: 2, datastore: "DS-1", cluster: "C1", capacityGB: 1024, provisionedGB: null,
    freeGB: 924, usedGB: null, ramGB: 0, memSnap: false, overheadPct: 10, buffer: 1.25, demandGB: null,
    ...over,
  });

  /* Rule 1 — overprovisioned: capacity must reach the provisioned value,
     regardless of how much free space is available today. */

  it("raises capacity to the provisioned value whenever provisioned > capacity", () => {
    // 1200 − 1024 = 176, even though 924 GB (90%) is free right now
    const r = assessRows([row({ provisionedGB: 1200 })]).valid[0];
    const rep = reportExpansion(r);
    expect(rep.overprovisioned).toBe(true);
    expect(rep.driver).toBe("overprovisioning");
    expect(rep.gb).toBe(176);
    expect(r.expansionGB).toBe(0); // app-side governance view stays untouched
  });

  it("still applies with abundant free space and a small overrun", () => {
    // 1100 − 1024 = 76; free space is irrelevant to this rule
    const rep = reportExpansion(assessRows([row({ provisionedGB: 1100 })]).valid[0]);
    expect(rep.driver).toBe("overprovisioning");
    expect(rep.gb).toBe(76);
  });

  it("never under-states: the buffer gap wins when it is larger", () => {
    // free 124 → used 900 → required 1253 → sizing gap 229 > provisioned gap 76
    const rep = reportExpansion(assessRows([row({ freeGB: 124, provisionedGB: 1100 })]).valid[0]);
    expect(rep.overprovisioned).toBe(true);
    expect(rep.gb).toBe(229);
    expect(rep.driver).toBe("buffer");
  });

  /* Rule 2 — not overprovisioned: only the free-space / sizing requirement. */

  it("asks only for the free-space buffer when not overprovisioned", () => {
    // buffer 1.0, no reserve, ram 100 → required 1748 ≤ 2048 → floor gap 512 − 400 = 112
    const rep = reportExpansion(
      assessRows([row({ capacityGB: 2048, freeGB: 400, provisionedGB: null, buffer: 1.0, overheadPct: 0, ramGB: 100 })]).valid[0]
    );
    expect(rep.overprovisioned).toBe(false);
    expect(rep.driver).toBe("buffer");
    expect(rep.gb).toBe(112);
  });

  it("requests nothing when thick-provisioned and compliant", () => {
    const rep = reportExpansion(assessRows([row({ provisionedGB: 1024 })]).valid[0]);
    expect(rep.overprovisioned).toBe(false); // equal to capacity is not overprovisioned
    expect(rep.driver).toBe("none");
    expect(rep.gb).toBe(0);
  });

  it("falls back to the governance view when provisioning is unknown", () => {
    const r = assessRows([row({ provisionedGB: null })]).valid[0];
    const rep = reportExpansion(r);
    expect(rep.gb).toBe(r.expansionGB);
    expect(rep.provisionedGB).toBeNull();
  });
});
