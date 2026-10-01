import { emptyCounts } from "../../../../../lib/consultant/metrics/funnel";
import {
  monthlyAwards,
  pointsFor,
  quarterAwards,
  rankLeaderboard,
  revenueRanks,
  tierStatuses,
} from "../../../../../lib/consultant/metrics/leaderboard";
import { GamificationSettings } from "../../../../../lib/consultant/types";

const S = GamificationSettings.parse({
  quarterTarget: 225000,
  tier1: { label: "Monthly Achiever", monthlyRevenue: 30000, reward: "R500 voucher" },
  tier2: { label: "High Performer", monthlyRevenue: 75000, reward: "R1 500 voucher" },
  tier3: { label: "Quarter Top", topN: 2, minQuarterRevenue: 150000, reward: "Apparel" },
  points: { dial: 1, connect: 2, meetingBooked: 10, meetingHeld: 15, proposal: 20, won: 40, paid: 100 },
  closeTargetFromConnects: 0.3,
});

describe("tiers", () => {
  it("monthly thresholds are inclusive (≥) and both tiers can be earned", () => {
    const m = new Map([
      ["a", 29999],
      ["b", 30000],
      ["c", 75000],
      ["d", 0],
    ]);
    const awards = monthlyAwards(m, "2026-10", S).map((a) => `${a.consultantId}:${a.tier}`);
    expect(awards).toEqual(["b:tier1_monthly_achiever", "c:tier1_monthly_achiever", "c:tier2_high_performer"]);
  });

  it("zero-threshold settings never award someone with no revenue", () => {
    const zero = { ...S, tier1: { ...S.tier1, monthlyRevenue: 0 } };
    expect(monthlyAwards(new Map([["x", 0]]), "2026-10", zero)).toEqual([]);
  });

  it("awarding is deterministic — same input, same awards (the DB unique key makes re-runs no-ops)", () => {
    const m = new Map([["b", 80000]]);
    expect(monthlyAwards(m, "2026-10", S)).toEqual(monthlyAwards(m, "2026-10", S));
  });

  it("quarter: top N AND the minimum; ties at the cut-off all qualify", () => {
    const q = new Map([
      ["a", 300000],
      ["b", 200000],
      ["c", 200000],
      ["d", 140000],
    ]);
    const ranks = revenueRanks(q);
    expect([...ranks.entries()]).toEqual([["a", 1], ["b", 2], ["c", 2], ["d", 4]]);
    expect(quarterAwards(q, "2026-Q4", S).map((a) => a.consultantId).sort()).toEqual(["a", "b", "c"]);
    // top-ranked but under the minimum → nothing
    expect(quarterAwards(new Map([["x", 149999]]), "2026-Q4", S)).toEqual([]);
  });

  it("tier status progress is clamped 0..1", () => {
    const t = tierStatuses({ monthRevenue: 60000, monthKey: "2026-10", quarterRevenue: 400000, quarterKey: "2026-Q4", quarterRank: 1 }, S);
    expect(t.map((x) => [x.tier, x.achieved, x.progress])).toEqual([
      ["tier1_monthly_achiever", true, 1],
      ["tier2_high_performer", false, 0.8],
      ["tier3_quarter_top", true, 1],
    ]);
  });
});

describe("leaderboard ranking", () => {
  const row = (id: string, name: string, p: Partial<ReturnType<typeof emptyCounts>>) => ({
    consultantId: id,
    name,
    counts: { ...emptyCounts(), ...p },
    tiers: { monthRevenue: 0, monthKey: "2026-10", quarterRevenue: p.revenuePaid ?? 0, quarterKey: "2026-Q4", quarterRank: null },
  });

  it("points are the weighted sum of activity", () => {
    expect(pointsFor({ dials: 10, connects: 3, meetingsBooked: 1, meetingsHeld: 1, proposals: 1, won: 1, paid: 1 }, S.points)).toBe(10 + 6 + 10 + 15 + 20 + 40 + 100);
  });

  it("ties share a rank; order is total (revenue, deals, name)", () => {
    const rows = rankLeaderboard(
      [row("1", "Zanele", { dials: 10 }), row("2", "Andre", { dials: 10 }), row("3", "Ben", { dials: 20 }), row("4", "Cara", { dials: 5, paid: 1, revenuePaid: 15000 })],
      S,
      "points",
    );
    expect(rows.map((r) => [r.name, r.rank])).toEqual([["Cara", 1], ["Ben", 2], ["Andre", 3], ["Zanele", 3]]);
    expect(rows[0].commission).toBe(0);
    expect(rows[0].quarterProgress).toBeCloseTo(15000 / 225000);
  });

  it("rank by revenue", () => {
    const rows = rankLeaderboard([row("1", "A", { dials: 999 }), row("2", "B", { revenuePaid: 1, paid: 1 })], S, "revenue");
    expect(rows[0].name).toBe("B");
  });
});
