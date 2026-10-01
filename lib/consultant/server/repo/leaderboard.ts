import type { Sql } from "postgres";
import { emptyCounts } from "../../metrics/funnel";
import { rankLeaderboard, revenueRanks, type LeaderboardInput } from "../../metrics/leaderboard";
import { monthKey, periodRange, quarterKey } from "../../metrics/periods";
import type { Leaderboard, Period } from "../../types";
import { consultantNames, rawCounts, revenueByConsultant } from "./metrics";
import { getGamificationSettings } from "./settings";

/**
 * The leaderboard: every active sales consultant (plus anyone with activity in the period),
 * every metric incl. commission (visible to all by decision), points from the live
 * gamification settings, quarterly target progress and Tier 1/2/3 status. Tiers always use the
 * CURRENT SAST month / quarter regardless of the period tab, so badges don't flicker.
 */
export async function leaderboard(db: Sql, period: Period, rankBy: "points" | "revenue", now: Date = new Date()): Promise<Leaderboard> {
  const settings = await getGamificationSettings(db);
  const [counts, monthRevenue, quarterRevenue, roster] = await Promise.all([
    rawCounts(db, periodRange(period, now), null),
    revenueByConsultant(db, periodRange("month", now)),
    revenueByConsultant(db, periodRange("quarter", now)),
    db<{ id: string }[]>`select id::text from public.team_members where role = 'sales_consultant' and status = 'active'`,
  ]);
  const ids = new Set<string>([...roster.map((r) => r.id), ...counts.keys(), ...monthRevenue.keys(), ...quarterRevenue.keys()]);
  const names = await consultantNames(db, [...ids]);
  const quarterAll = new Map([...ids].map((id) => [id, quarterRevenue.get(id) ?? 0]));
  const ranks = revenueRanks(quarterAll);
  const mk = monthKey(now);
  const qk = quarterKey(now);

  const inputs: LeaderboardInput[] = [...ids]
    .filter((id) => names.has(id))
    .map((id) => ({
      consultantId: id,
      name: names.get(id)!,
      counts: counts.get(id) ?? emptyCounts(),
      tiers: {
        monthRevenue: monthRevenue.get(id) ?? 0,
        monthKey: mk,
        quarterRevenue: quarterRevenue.get(id) ?? 0,
        quarterKey: qk,
        quarterRank: ranks.get(id) ?? null,
      },
    }));
  return { period, rankedBy: rankBy, rows: rankLeaderboard(inputs, settings, rankBy), generatedAt: now.toISOString() };
}
