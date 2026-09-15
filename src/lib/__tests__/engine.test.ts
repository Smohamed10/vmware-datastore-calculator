/**
 * Golden-number test suite for the calculation engine.
 * Run with: npx vitest run
 * These values are the arithmetic contract — if a formula changes,
 * these tests must change deliberately (and APP.formulaVersion must bump).
 */
import { describe, expect, it } from "vitest";
import { POLICY } from "../../config/policy";
import { allUnits, calcDatastore, calcDWR, calcHealth, calcSnapshot, fmt, fromGB, toGB } from "../engine";
import { runPreChecks } from "../validation";

describe("unit conversions", () => {
  it("converts to GB across units", () => {
    expect(toGB(1, "TB")).toBe(1024);
    expect(toGB("2", "TB")).toBe(2048);
    expect(toGB(512, "MB")).toBe(0.5);
    expect(toGB(1024 * 1024, "KB")).toBe(1);
    expect(toGB(1, "PB")).toBe(1024 * 1024);
  });

  it("rejects invalid and negative input", () => {
    expect(toGB("abc", "GB")).toBe(0);
    expect(toGB(-5, "GB")).toBe(0);
    expect(toGB("", "GB")).toBe(0);
  });

  it("round-trips GB through units", () => {
    expect(fromGB(1024, "TB")).toBe(1);
    expect(allUnits(1024).TB).toBe(1);
    expect(allUnits(1024).GB).toBe(1024);
  });
});

describe("fmt", () => {
  it("formats edge cases", () => {
    expect(fmt(null)).toBe("—");
    expect(fmt(0)).toBe("0");
    expect(fmt(123.456789, 2)).toBe("123.46");
  });
});

describe("calcDatastore", () => {
  it("computes the standard sizing", () => {
    const r = calcDatastore({ usedGB: 1000, ramGB: 128, snapGB: 512, buffer: 1.25 });
    expect(r.raw).toBeCloseTo(1640, 6);
    expect(r.required).toBeCloseTo(2050, 6);
    expect(r.padding).toBeCloseTo(410, 6);
    expect(r.bufferPct).toBeCloseTo(25, 6);
  });

  it("doubles RAM when memory snapshot is included", () => {
    const r = calcDatastore({ usedGB: 1000, ramGB: 128, snapGB: 512, buffer: 1.25, memSnap: true });
    expect(r.ramGB).toBe(256);
    expect(r.required).toBeCloseTo((1000 + 256 + 512) * 1.25, 6);
  });

  it("falls back to the policy buffer", () => {
    const r = calcDatastore({ usedGB: 100, ramGB: 0, snapGB: 10 });
    expect(r.required).toBeCloseTo(110 * POLICY.safetyBuffer, 6);
  });
});

describe("calcHealth", () => {
  it("returns null for zero capacity", () => {
    expect(calcHealth(0, 0, 100, 0)).toBeNull();
  });

  it("approves when free space is above policy", () => {
    const h = calcHealth(5120, 2560, 2050, 512)!;
    expect(h.freePct).toBe(50);
    expect(h.status).toBe("APPROVED");
    expect(h.sev).toBe("success");
    expect(h.snapAuthorized).toBe(true);
    expect(h.sufficient).toBe(true);
    expect(h.gapGB).toBe(0);
  });

  it("warns between the two thresholds", () => {
    const h = calcHealth(5120, 900, 1000, 100)!;
    expect(h.freePct).toBeCloseTo(17.58, 2);
    expect(h.status).toBe("WARNING");
    expect(h.snapAuthorized).toBe(false);
  });

  it("flags critical below the danger line and computes the expansion gap", () => {
    const h = calcHealth(1000, 100, 1600, 50)!;
    expect(h.status).toBe("CRITICAL");
    expect(h.sufficient).toBe(false);
    expect(h.gapGB).toBeCloseTo(600, 2);
  });

  it("detects a policy breach at peak snapshot consumption", () => {
    // 30% free today, but 200 GB of snapshot demand leaves 10% at peak
    const h = calcHealth(1000, 300, 500, 200)!;
    expect(h.status).toBe("APPROVED");
    expect(h.projectedFreePct).toBeCloseTo(10, 2);
    expect(h.breachAtPeak).toBe(true);
    expect(h.snapAuthorized).toBe(false);
  });
});

describe("calcDWR", () => {
  it("converts KB/s to GB/day using the derived constant", () => {
    expect(calcDWR(100)).toBeCloseTo(8.2397, 3);
    expect(calcDWR(0)).toBe(0);
    expect(calcDWR(-10)).toBe(0);
  });
});

describe("calcSnapshot", () => {
  it("computes delta and memory state", () => {
    const r = calcSnapshot({ dwr: 10, days: 7, sf: 1.2, mem: true, ramGB: 64 });
    expect(r.delta).toBeCloseTo(84, 6);
    expect(r.memSize).toBeCloseTo(64 + POLICY.memoryStateOverheadGB, 4);
    expect(r.total).toBeCloseTo(84 + 64 + POLICY.memoryStateOverheadGB, 4);
    expect(r.capped).toBe(false);
  });

  it("caps the delta at the provisioned disk size", () => {
    const r = calcSnapshot({ dwr: 10, days: 7, sf: 1.2, capGB: 50 });
    expect(r.deltaRaw).toBeCloseTo(84, 6);
    expect(r.delta).toBe(50);
    expect(r.capped).toBe(true);
    expect(r.total).toBe(50);
  });
});

describe("runPreChecks", () => {
  const base = {
    used: { v: "500", u: "GB" as const },
    ram: { v: "128", u: "GB" as const },
    dsCap: { v: "5", u: "TB" as const },
    snap: { v: "512", u: "GB" as const },
    curTot: { v: "5", u: "TB" as const },
    curFree: { v: "2", u: "TB" as const },
    buf: "1.25",
    memSnap: false,
  };

  it("passes a sane input set", () => {
    const r = runPreChecks(base);
    expect(r.errors).toHaveLength(0);
  });

  it("requires used space and capacity", () => {
    const r = runPreChecks({ ...base, used: { v: "", u: "GB" }, dsCap: { v: "", u: "TB" } });
    expect(r.errors.map((e) => e.field)).toEqual(expect.arrayContaining(["used", "dsCap"]));
  });

  it("rejects free space above capacity", () => {
    const r = runPreChecks({ ...base, curFree: { v: "10", u: "TB" } });
    expect(r.errors.some((e) => e.field === "curFree")).toBe(true);
  });

  it("warns when overhead would exhaust free space", () => {
    const r = runPreChecks({ ...base, snap: { v: "3", u: "TB" }, curFree: { v: "2", u: "TB" } });
    expect(r.warnings.some((w) => w.includes("consume the entire current free space"))).toBe(true);
  });

  it("warns on implausible RAM units", () => {
    const r = runPreChecks({ ...base, ram: { v: "2", u: "TB" } });
    expect(r.warnings.some((w) => w.includes("RAM is usually measured in GB"))).toBe(true);
  });
});
