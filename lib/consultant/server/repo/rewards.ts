import type { Sql } from "postgres";
import { monthlyAwards, quarterAwards, type Award } from "../../metrics/leaderboard";
import { monthKey, periodRange, previousMonthRange, previousQuarterRange, sastParts } from "../../metrics/periods";
import { TUNABLES_3A } from "../../metrics/tunables";
import { TIER_IDS, type Reward, type TierId } from "../../types";
import { audit } from "../audit";
import { iso } from "../util";
import { revenueByConsultant } from "./metrics";
import { getGamificationSettings } from "./settings";

/**
 * Rewards: awarding (dispatch cron) + listing + fulfilment (Acquisition & Creative).
 *
 * Idempotency: `consultant_rewards` is unique on (consultant_id, tier, period_key), and awards
 * are inserted with ON CONFLICT DO NOTHING — running the cron any number of times awards each
 * tier at most once per consultant per period. The insert trigger emits `reward.tier_achieved`
 * (outbox) only for rows actually inserted.
 */

export async function insertAward(db: Sql, a: Award): Promise<boolean> {
  const rows = await db`
    insert into public.consultant_rewards (consultant_id, tier, period_key, reward)
    values (${a.consultantId}::uuid, ${a.tier}, ${a.periodKey}, ${a.reward})
    on conflict (consultant_id, tier, period_key) do nothing
    returning id
  `;
  return rows.length > 0;
}

export type AwardReport = { considered: number; awarded: number };

/**
 * - Tier 1 / 2: the current SAST month; during the first `monthlyGraceDays` of a month the
 *   previous month too (payments confirmed late but backdated).
 * - Tier 3: the previous quarter, only within `tier3GraceDays` of the new quarter (after that
 *   the closed quarter is frozen, so a backdated payment can't push someone into a top-N that
 *   was already awarded).
 */
export async function awardTiers(db: Sql, now: Date = new Date()): Promise<AwardReport> {
  const s = await getGamificationSettings(db);
  const awards: Award[] = [];
  const cur = periodRange("month", now);
  awards.push(...monthlyAwards(await revenueByConsultant(db, cur), monthKey(now), s));

  const day = sastParts(now).day;
  if (day <= TUNABLES_3A.rewards.monthlyGraceDays) {
    const prev = previousMonthRange(now);
    awards.push(...monthlyAwards(await revenueByConsultant(db, prev), prev.key, s));
  }
  const q = periodRange("quarter", now);
  const daysIntoQuarter = (now.getTime() - Date.parse(q.from)) / 86_400_000;
  if (daysIntoQuarter < TUNABLES_3A.rewards.tier3GraceDays) {
    const pq = previousQuarterRange(now);
    awards.push(...quarterAwards(await revenueByConsultant(db, pq), pq.key, s));
  }

  let awarded = 0;
  for (const a of awards) {
    if (await insertAward(db, a)) {
      awarded++;
      await audit(db, { actorId: null, actorKind: "system", action: "reward.awarded", entity: "consultant", entityId: a.consultantId, meta: { tier: a.tier, periodKey: a.periodKey } });
    }
  }
  return { considered: awards.length, awarded };
}

type RewardRow = {
  id: string;
  consultant_id: string;
  consultant_name: string;
  tier: string;
  period_key: string;
  reward: string;
  achieved_at: Date | string;
  fulfilled_at: Date | string | null;
  fulfilled_by_name: string | null;
};

function toReward(r: RewardRow): Reward {
  return {
    id: r.id,
    consultantId: r.consultant_id,
    consultantName: r.consultant_name,
    tier: (TIER_IDS as readonly string[]).includes(r.tier) ? (r.tier as TierId) : "tier1_monthly_achiever",
    periodKey: r.period_key,
    reward: r.reward,
    achievedAt: iso(r.achieved_at) ?? new Date(0).toISOString(),
    fulfilledAt: iso(r.fulfilled_at),
    fulfilledByName: r.fulfilled_by_name,
  };
}

function rewardSelect(db: Sql) {
  return db`
    select r.id::text, r.consultant_id::text as consultant_id,
      coalesce(nullif(m.full_name, ''), m.username)::text as consultant_name,
      r.tier, r.period_key, r.reward, r.achieved_at, r.fulfilled_at,
      coalesce(nullif(f.full_name, ''), f.username)::text as fulfilled_by_name
    from public.consultant_rewards r
    join public.team_members m on m.id = r.consultant_id
    left join public.team_members f on f.id = r.fulfilled_by
  `;
}

/** `consultantId` null = everyone (managers / manage_gamification). */
export async function listRewards(db: Sql, opts: { status: "pending" | "all"; consultantId: string | null; limit: number }): Promise<Reward[]> {
  const rows = await db<RewardRow[]>`
    ${rewardSelect(db)}
    where (${opts.consultantId}::uuid is null or r.consultant_id = ${opts.consultantId}::uuid)
      and (${opts.status === "all"} or r.fulfilled_at is null)
    order by r.fulfilled_at is not null, r.achieved_at desc
    limit ${opts.limit}
  `;
  return rows.map(toReward);
}

/** Mark a reward fulfilled (idempotent: a second call keeps the first fulfiller/time). Null = no such reward. */
export async function fulfilReward(db: Sql, id: string, memberId: string): Promise<Reward | null> {
  const updated = await db`
    update public.consultant_rewards set fulfilled_at = now(), fulfilled_by = ${memberId}::uuid
    where id = ${id}::uuid and fulfilled_at is null
    returning id
  `;
  const rows = await db<RewardRow[]>`${rewardSelect(db)} where r.id = ${id}::uuid`;
  if (!rows[0]) return null;
  if (updated.length) {
    await audit(db, { actorId: memberId, actorKind: "member", action: "reward.fulfilled", entity: "reward", entityId: id, meta: { tier: rows[0].tier, periodKey: rows[0].period_key } });
  }
  return toReward(rows[0]);
}
