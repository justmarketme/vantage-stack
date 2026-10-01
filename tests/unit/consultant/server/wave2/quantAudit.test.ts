/**
 * Agent 4.3 quant audit — pure maths that decides payouts and targets. Complements
 * calculator / periods / tiers / funnel tests with: the Dec→Jan week, the full calculator chain
 * through SA working days (public holidays excluded), minimality of every rounded-up count,
 * and the exact Tier 1 / Tier 2 / Tier 3 boundary values.
 */
import { calculate } from "../../../../../lib/consultant/metrics/calculator";
import { commissionFor } from "../../../../../lib/consultant/metrics/commission";
import { buildFunnel, emptyCounts } from "../../../../../lib/consultant/metrics/funnel";
import { monthlyAwards, quarterAwards, rankLeaderboard, tierStatuses } from "../../../../../lib/consultant/metrics/leaderboard";
import { periodRange, quarterKey } from "../../../../../lib/consultant/metrics/periods";
import { dailyPlanFor } from "../../../../../lib/consultant/server/repo/goals";
import { workingDaysBetween, workingDaysUntil } from "../../../../../lib/consultant/server/workingDays";
import { GamificationSettings, type CalculatorInput } from "../../../../../lib/consultant/types";

const settings = GamificationSettings.parse({
  quarterTarget: 225000,
  tier1: { label: "Monthly Achiever", monthlyRevenue: 30000, reward: "R500 Takealot voucher" },
  tier2: { label: "High Performer", monthlyRevenue: 75000, reward: "R1 500 Takealot voucher" },
  tier3: { label: "Quarter Top Performer", topN: 3, minQuarterRevenue: 150000, reward: "VantageStack branded apparel" },
  points: { dial: 1, connect: 2, meetingBooked: 10, meetingHeld: 15, proposal: 20, won: 40, paid: 100 },
  closeTargetFromConnects: 0.3,
});

describe("SAST periods across the year boundary", () => {
  it("the week containing 1 Jan 2027 (a Friday) runs Mon 28 Dec 2026 → Mon 4 Jan 2027 SAST", () => {
    const nyd = new Date("2027-01-01T10:00:00Z");
    expect(periodRange("week", nyd)).toEqual({ from: "2026-12-27T22:00:00.000Z", to: "2027-01-03T22:00:00.000Z" });
    // Sunday 3 Jan 23:59:59 SAST is still that week; Monday 00:00 SAST is the next.
    expect(periodRange("week", new Date("2027-01-03T21:59:59.999Z")).from).toBe("2026-12-27T22:00:00.000Z");
    expect(periodRange("week", new Date("2027-01-03T22:00:00.000Z")).from).toBe("2027-01-03T22:00:00.000Z");
  });

  it("Q4 → Q1 flips at SAST midnight on 1 January, not UTC midnight", () => {
    expect(quarterKey(new Date("2026-12-31T21:59:59.999Z"))).toBe("2026-Q4");
    expect(quarterKey(new Date("2026-12-31T22:00:00.000Z"))).toBe("2027-Q1");
    expect(periodRange("quarter", new Date("2026-12-31T23:30:00Z"))).toEqual({ from: "2026-12-31T22:00:00.000Z", to: "2027-03-31T22:00:00.000Z" });
  });
});

describe("calculator chain: goal → deals → connects → dials → per SA working day", () => {
  it("December 2026 from the 1st: 21 working days (Day of Reconciliation + Christmas excluded)", () => {
    expect(workingDaysBetween("2026-12-01", "2026-12-31")).toBe(21);
    // 08:00 SAST on 1 Dec, target 31 Dec → the same 21 days.
    const days = workingDaysUntil("2026-12-31", new Date("2026-12-01T06:00:00Z"));
    expect(days).toBe(21);
    // R30 000 commission at 25% of a R15 000 sale = R3 750 per deal → 8 deals; 30% close on
    // connects → ⌈26.67⌉ = 27 connects; 30% connect rate → ⌈90⌉ = 90 dials.
    const plan = dailyPlanFor("commission", 30000, days, { avgSale: 15000, closeFromConnects: 0.3, connectRate: 0.3, commissionRate: 0.25 });
    expect(plan).toEqual({
      dealsNeeded: 8,
      connectsNeeded: 27,
      dialsNeeded: 90,
      perDay: { dials: 5, connects: 2, deals: 0.38 }, // ⌈90/21⌉=5, ⌈27/21⌉=2, 8/21=0.380… → 0.38
      revenue: 120000,
      commission: 30000,
    });
  });

  it("deals per day is a 2-dp rate (not rounded up); dials/connects per day are rounded up", () => {
    const r = calculate({ goalType: "deals", goalValue: 1, workingDays: 3, avgSale: 15000, closeFromConnects: 0.3, connectRate: 0.3, commissionRate: 0.25 });
    expect(r.perDay.deals).toBe(0.33);
    expect(r.connectsNeeded).toBe(4); // ⌈3.33⌉
    expect(r.dialsNeeded).toBe(14); // ⌈13.33⌉
    expect(r.perDay).toMatchObject({ connects: 2, dials: 5 });
    expect(calculate({ goalType: "deals", goalValue: 2, workingDays: 3, avgSale: 1, closeFromConnects: 1, connectRate: 1, commissionRate: 0 }).perDay.deals).toBe(0.67);
  });

  it("every count is the SMALLEST whole number that reaches the goal (no over- or under-statement)", () => {
    const rates = [0.05, 0.1, 0.17, 0.25, 0.3, 0.33, 0.5, 0.9, 1];
    for (const goalValue of [1, 7, 3750, 3751, 29999, 30000, 123457]) {
      for (const closeFromConnects of rates) {
        for (const connectRate of rates) {
          const input: CalculatorInput = { goalType: "commission", goalValue, workingDays: 17, avgSale: 15000, closeFromConnects, connectRate, commissionRate: 0.25 };
          const r = calculate(input);
          const perDeal = 15000 * 0.25;
          // enough …
          expect(r.dealsNeeded * perDeal).toBeGreaterThanOrEqual(goalValue - 1e-6);
          expect(r.connectsNeeded * closeFromConnects).toBeGreaterThanOrEqual(r.dealsNeeded - 1e-6);
          expect(r.dialsNeeded * connectRate).toBeGreaterThanOrEqual(r.connectsNeeded - 1e-6);
          expect(r.perDay.dials * 17).toBeGreaterThanOrEqual(r.dialsNeeded);
          expect(r.perDay.connects * 17).toBeGreaterThanOrEqual(r.connectsNeeded);
          // … and one fewer would not be.
          expect((r.dealsNeeded - 1) * perDeal).toBeLessThan(goalValue);
          expect((r.connectsNeeded - 1) * closeFromConnects).toBeLessThan(r.dealsNeeded - 1e-9);
          expect((r.dialsNeeded - 1) * connectRate).toBeLessThan(r.connectsNeeded - 1e-9);
          expect((r.perDay.dials - 1) * 17).toBeLessThan(r.dialsNeeded);
          expect(r.commission).toBe(commissionFor(r.dealsNeeded * 15000, 0.25));
        }
      }
    }
  });
});

describe("funnel headline ratios use PAID, never won", () => {
  it("won-but-unpaid deals don't count toward closeFromDials / closeFromConnects", () => {
    const f = buildFunnel("month", { from: "a", to: "b" }, { ...emptyCounts(), dials: 40, connects: 10, won: 5, paid: 2, revenuePaid: 30000 });
    expect(f.rates.closeFromDials).toBe(0.05);
    expect(f.rates.closeFromConnects).toBe(0.2);
    const none = buildFunnel("month", { from: "a", to: "b" }, { ...emptyCounts(), won: 3 });
    expect(Object.values(none.rates).every((v) => v === null)).toBe(true);
    expect(none.avgSale).toBeNull();
    expect(none.velocityPerDay).toBeNull();
  });
});

describe("tier thresholds at the exact boundary values", () => {
  const month = (rev: Record<string, number>) => monthlyAwards(new Map(Object.entries(rev)), "2026-10", settings);

  it("Tier 1 at R30 000 exactly; R29 999 is not; Tier 2 at R75 000 exactly (and Tier 1 with it)", () => {
    const awards = month({ a: 29999, b: 30000, c: 74999, d: 75000, e: 0 });
    const by = (id: string) => awards.filter((x) => x.consultantId === id).map((x) => x.tier).sort();
    expect(by("a")).toEqual([]);
    expect(by("b")).toEqual(["tier1_monthly_achiever"]);
    expect(by("c")).toEqual(["tier1_monthly_achiever"]);
    expect(by("d")).toEqual(["tier1_monthly_achiever", "tier2_high_performer"]);
    expect(by("e")).toEqual([]);
    const status = tierStatuses({ monthRevenue: 30000, monthKey: "2026-10", quarterRevenue: 0, quarterKey: "2026-Q4", quarterRank: null }, settings);
    expect(status.map((s) => s.achieved)).toEqual([true, false, false]);
    expect(status[0].progress).toBe(1);
  });

  it("Tier 3: top 3 with ties at the cut-off all qualify; the minimum is inclusive; rank 5 never does", () => {
    const awards = quarterAwards(new Map(Object.entries({ a: 200000, b: 180000, c: 150000, d: 150000, e: 149999, f: 0 })), "2026-Q3", settings);
    expect(awards.map((x) => x.consultantId).sort()).toEqual(["a", "b", "c", "d"]);
    // A tie for 1st pushes the next consultant to rank 3, still inside the top 3.
    const tied = quarterAwards(new Map(Object.entries({ a: 160000, b: 160000, c: 155000, d: 154000 })), "2026-Q3", settings);
    expect(tied.map((x) => x.consultantId).sort()).toEqual(["a", "b", "c"]);
    // Top rank but under the minimum → nothing.
    expect(quarterAwards(new Map([["solo", 149999]]), "2026-Q3", settings)).toEqual([]);
  });

  it("leaderboard points follow the live settings, not constants", () => {
    const counts = { ...emptyCounts(), dials: 10, connects: 4, meetingsBooked: 2, meetingsHeld: 1, proposals: 1, won: 1, paid: 1 };
    const t = { monthRevenue: 0, monthKey: "2026-10", quarterRevenue: 0, quarterKey: "2026-Q4", quarterRank: null };
    const [row] = rankLeaderboard([{ consultantId: "x", name: "X", counts, tiers: t }], settings, "points");
    expect(row.points).toBe(10 * 1 + 4 * 2 + 2 * 10 + 15 + 20 + 40 + 100);
    const custom = { ...settings, points: { dial: 0, connect: 0, meetingBooked: 0, meetingHeld: 0, proposal: 0, won: 0, paid: 7 } };
    expect(rankLeaderboard([{ consultantId: "x", name: "X", counts, tiers: t }], custom, "points")[0].points).toBe(7);
  });
});
