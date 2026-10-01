import type { GamificationSettings, LeaderboardRow, TierId, TierStatus } from "../types";
import type { FunnelCounts } from "./funnel";
import { ratio } from "./funnel";

/**
 * Leaderboard + tier maths — pure (Quant lens: fairness is tested).
 *
 * Points = Σ activity × the per-activity points in the gamification settings.
 * Ranking: primary key (points or revenue) descending, then revenue, then deals paid, then name
 * (A→Z) so the order is total and stable. Tied consultants share a rank ("1, 1, 3").
 */

export function pointsFor(c: Pick<FunnelCounts, "dials" | "connects" | "meetingsBooked" | "meetingsHeld" | "proposals" | "won" | "paid">, p: GamificationSettings["points"]): number {
  return (
    c.dials * p.dial +
    c.connects * p.connect +
    c.meetingsBooked * p.meetingBooked +
    c.meetingsHeld * p.meetingHeld +
    c.proposals * p.proposal +
    c.won * p.won +
    c.paid * p.paid
  );
}

export type TierInputs = {
  monthRevenue: number;
  monthKey: string;
  quarterRevenue: number;
  quarterKey: string;
  /** 1-based rank by quarter revenue among consultants with revenue > 0, or null. */
  quarterRank: number | null;
};

function progress(current: number, threshold: number): number {
  if (!(threshold > 0)) return current > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, current / threshold));
}

/**
 * Tier status for one consultant. Tier 1 / 2: SAST-month revenue paid ≥ the tier threshold.
 * Tier 3: currently in the top N by quarter revenue AND ≥ the quarterly minimum (it is only
 * AWARDED once the quarter closes — see `quarterAwards`).
 */
export function tierStatuses(t: TierInputs, s: GamificationSettings): TierStatus[] {
  const tier3Achieved = t.quarterRank !== null && t.quarterRank <= s.tier3.topN && t.quarterRevenue >= s.tier3.minQuarterRevenue;
  return [
    {
      tier: "tier1_monthly_achiever",
      label: s.tier1.label,
      reward: s.tier1.reward,
      periodKey: t.monthKey,
      threshold: s.tier1.monthlyRevenue,
      current: t.monthRevenue,
      progress: progress(t.monthRevenue, s.tier1.monthlyRevenue),
      achieved: t.monthRevenue >= s.tier1.monthlyRevenue,
    },
    {
      tier: "tier2_high_performer",
      label: s.tier2.label,
      reward: s.tier2.reward,
      periodKey: t.monthKey,
      threshold: s.tier2.monthlyRevenue,
      current: t.monthRevenue,
      progress: progress(t.monthRevenue, s.tier2.monthlyRevenue),
      achieved: t.monthRevenue >= s.tier2.monthlyRevenue,
    },
    {
      tier: "tier3_quarter_top",
      label: s.tier3.label,
      reward: s.tier3.reward,
      periodKey: t.quarterKey,
      threshold: s.tier3.minQuarterRevenue,
      current: t.quarterRevenue,
      progress: progress(t.quarterRevenue, s.tier3.minQuarterRevenue),
      achieved: tier3Achieved,
    },
  ];
}

/**
 * Competition ranks ("1, 1, 3") by revenue for everyone with revenue > 0. Consultants with no
 * revenue get null (they cannot be a quarter top performer).
 */
export function revenueRanks(revenue: Map<string, number>): Map<string, number | null> {
  const sorted = [...revenue.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const out = new Map<string, number | null>();
  for (const id of revenue.keys()) out.set(id, null);
  let rank = 0;
  sorted.forEach(([id, v], i) => {
    if (i === 0 || v !== sorted[i - 1][1]) rank = i + 1;
    out.set(id, rank);
  });
  return out;
}

export type Award = { consultantId: string; tier: TierId; periodKey: string; reward: string };

/** Monthly Tier 1 / Tier 2 awards for one SAST month (a consultant can earn both). */
export function monthlyAwards(monthRevenue: Map<string, number>, periodKey: string, s: GamificationSettings): Award[] {
  const out: Award[] = [];
  for (const [consultantId, revenue] of monthRevenue) {
    if (revenue > 0 && revenue >= s.tier1.monthlyRevenue) out.push({ consultantId, tier: "tier1_monthly_achiever", periodKey, reward: s.tier1.reward });
    if (revenue > 0 && revenue >= s.tier2.monthlyRevenue) out.push({ consultantId, tier: "tier2_high_performer", periodKey, reward: s.tier2.reward });
  }
  return out;
}

/**
 * Tier 3 for a CLOSED quarter: consultants ranked ≤ topN by quarter revenue who also reached the
 * minimum. Ties at the cut-off are all included (competition ranking) — fairer than an arbitrary
 * tie-break, and documented for the rewards admin.
 */
export function quarterAwards(quarterRevenue: Map<string, number>, periodKey: string, s: GamificationSettings): Award[] {
  const ranks = revenueRanks(quarterRevenue);
  const out: Award[] = [];
  for (const [consultantId, revenue] of quarterRevenue) {
    const r = ranks.get(consultantId);
    if (r != null && r <= s.tier3.topN && revenue >= s.tier3.minQuarterRevenue) {
      out.push({ consultantId, tier: "tier3_quarter_top", periodKey, reward: s.tier3.reward });
    }
  }
  return out;
}

export type LeaderboardInput = {
  consultantId: string;
  name: string;
  counts: FunnelCounts;
  tiers: TierInputs;
};

/** Build and rank the rows. */
export function rankLeaderboard(inputs: LeaderboardInput[], s: GamificationSettings, rankBy: "points" | "revenue"): LeaderboardRow[] {
  const rows = inputs.map((i): LeaderboardRow => ({
    consultantId: i.consultantId,
    name: i.name,
    rank: 0,
    points: pointsFor(i.counts, s.points),
    revenuePaid: i.counts.revenuePaid,
    dealsPaid: i.counts.paid,
    commission: i.counts.commission,
    dials: i.counts.dials,
    connects: i.counts.connects,
    meetingsBooked: i.counts.meetingsBooked,
    meetingsHeld: i.counts.meetingsHeld,
    closeFromDials: ratio(i.counts.paid, i.counts.dials),
    closeFromConnects: ratio(i.counts.paid, i.counts.connects),
    quarterTarget: s.quarterTarget,
    quarterProgress: progress(i.tiers.quarterRevenue, s.quarterTarget),
    tiers: tierStatuses(i.tiers, s),
  }));
  const key = (r: LeaderboardRow) => (rankBy === "points" ? r.points : r.revenuePaid);
  rows.sort((a, b) => key(b) - key(a) || b.revenuePaid - a.revenuePaid || b.dealsPaid - a.dealsPaid || a.name.localeCompare(b.name));
  rows.forEach((r, i) => {
    r.rank = i > 0 && key(r) === key(rows[i - 1]) ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
