import { calculate, ceilCount } from "../../../../../lib/consultant/metrics/calculator";
import { commissionFor, storedRate } from "../../../../../lib/consultant/metrics/commission";
import type { CalculatorInput } from "../../../../../lib/consultant/types";

const base: CalculatorInput = {
  goalType: "commission",
  goalValue: 30000,
  workingDays: 20,
  avgSale: 15000,
  closeFromConnects: 0.3,
  connectRate: 0.25,
  commissionRate: 0.25,
};

describe("calculate()", () => {
  it("matches the documented worked example", () => {
    const r = calculate(base);
    expect(r).toEqual({
      dealsNeeded: 8,
      connectsNeeded: 27,
      dialsNeeded: 108,
      perDay: { dials: 6, connects: 2, deals: 0.4 },
      revenue: 120000,
      commission: 30000,
    });
  });

  it("revenue and deals goals", () => {
    expect(calculate({ ...base, goalType: "revenue", goalValue: 45000 }).dealsNeeded).toBe(3);
    expect(calculate({ ...base, goalType: "revenue", goalValue: 45001 }).dealsNeeded).toBe(4);
    expect(calculate({ ...base, goalType: "deals", goalValue: 5 }).dealsNeeded).toBe(5);
  });

  it("exact boundaries don't round up from float noise", () => {
    // 0.3 × 10 = 3 exactly in maths, 2.9999999999999996 / 3.0000000000000004 in floats
    const r = calculate({ ...base, goalType: "deals", goalValue: 3, closeFromConnects: 0.3, connectRate: 0.1 });
    expect(r.connectsNeeded).toBe(10);
    expect(r.dialsNeeded).toBe(100);
    // commission goal exactly one deal's commission → 1 deal, not 2
    expect(calculate({ ...base, goalValue: 3750 }).dealsNeeded).toBe(1);
    expect(calculate({ ...base, goalValue: 3751 }).dealsNeeded).toBe(2);
  });

  it("counts are always whole and never under-state the work", () => {
    for (const goal of [1, 999, 3750, 12345, 99999]) {
      const r = calculate({ ...base, goalValue: goal });
      expect(Number.isInteger(r.dealsNeeded) && Number.isInteger(r.connectsNeeded) && Number.isInteger(r.dialsNeeded)).toBe(true);
      expect(r.dealsNeeded * base.avgSale * base.commissionRate).toBeGreaterThanOrEqual(goal);
      expect(r.connectsNeeded * base.closeFromConnects).toBeGreaterThanOrEqual(r.dealsNeeded - 1e-9);
      expect(r.dialsNeeded * base.connectRate).toBeGreaterThanOrEqual(r.connectsNeeded - 1e-9);
      expect(r.perDay.dials * base.workingDays).toBeGreaterThanOrEqual(r.dialsNeeded);
    }
  });

  it("one working day puts everything on today", () => {
    const r = calculate({ ...base, workingDays: 1 });
    expect(r.perDay.dials).toBe(r.dialsNeeded);
  });

  it("rejects an unreachable commission goal", () => {
    expect(() => calculate({ ...base, commissionRate: 0 })).toThrow(RangeError);
    expect(() => calculate({ ...base, goalType: "revenue", commissionRate: 0 })).not.toThrow();
  });

  it("ceilCount", () => {
    expect(ceilCount(2.0000000000000004)).toBe(2);
    expect(ceilCount(2.01)).toBe(3);
    expect(ceilCount(0)).toBe(0);
    expect(ceilCount(Number.NaN)).toBe(0);
  });
});

describe("commissionFor() — half-up to whole rand on the amount paid", () => {
  it.each([
    [10000, 0.25, 2500],
    [10001, 0.25, 2500], // 2500.25
    [10002, 0.25, 2501], // 2500.5 → half up
    [10003, 0.25, 2501], // 2500.75
    [1010, 0.35, 354], // 353.5 exactly in maths; naive float gives 353.49999999999994
    [2, 0.25, 1], // 0.5 → 1
    [1, 0.25, 0], // 0.25 → 0
    [50_000_000, 0.25, 12_500_000],
  ])("%d × %d = %d", (amount, rate, want) => {
    expect(commissionFor(amount, rate)).toBe(want);
  });

  it("zero / negative / NaN never pay commission", () => {
    expect(commissionFor(0, 0.25)).toBe(0);
    expect(commissionFor(1000, 0)).toBe(0);
    expect(commissionFor(-1000, 0.25)).toBe(0);
    expect(commissionFor(Number.NaN, 0.25)).toBe(0);
  });

  it("stores the rate at numeric(6,4) precision", () => {
    expect(storedRate(0.25)).toBe(0.25);
    expect(storedRate(0.123456)).toBe(0.1235);
  });
});
