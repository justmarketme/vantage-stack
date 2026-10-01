import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import { CALL_DISPOSITIONS, CLINICS_VERTICAL, SALES_STAGES, type CallDisposition, type DealScore, type SalesStage } from "../../types";
import { RECENT_CALLS } from "./constants";
import { scoreDeal, type ScoreFeatures } from "./model";

/**
 * The SQL side of heuristic-v1: one set-based query computes every feature for a batch of
 * leads (so the pipeline's weighted value can score many leads in one round trip).
 *
 * - median_days: per stage, the median of "days currently spent in this stage" over all OPEN
 *   Clinics leads in that stage (percentile_cont(0.5)). It is the peer baseline for velocity.
 * - last touch: the latest of stage change, last call, last meeting status change, creation.
 * - recent calls: the last RECENT_CALLS calls → answered count, positive dispositions, the
 *   latest disposition and the unanswered streak (calls after the last answered one).
 * - Coach Alex: sentiment + recommended stage of the latest READY summary.
 * - meetings: no-shows, held, upcoming scheduled.
 * - value: the deal's monthly value, else the average paid amount across Clinics deals, else
 *   cfg.metrics.defaultAvgSale.
 */

type FeatureRow = {
  id: string;
  stage: string | null;
  days_in_stage: number | string;
  median_days: number | string | null;
  days_since_touch: number | string;
  answered: number;
  unanswered_streak: number;
  positive: number;
  last_disposition: string | null;
  last_sentiment: string | null;
  recommended_stage: string | null;
  no_shows: number;
  held: number;
  upcoming: number;
  next_action_at: Date | string | null;
  deal_value: number | string | null;
  avg_paid: number | string | null;
};

export async function scoreFeatures(db: Sql, leadIds: string[], now: Date = new Date()): Promise<Map<string, ScoreFeatures>> {
  const out = new Map<string, ScoreFeatures>();
  if (!leadIds.length) return out;
  const rows = await db<FeatureRow[]>`
    with target as (
      select c.* from public.clients c
      where c.id = any(${leadIds}::uuid[]) and c.vertical = ${CLINICS_VERTICAL}
    ),
    medians as (
      select coalesce(c.sales_stage, 'new') as stage,
        percentile_cont(0.5) within group (
          order by extract(epoch from (${now}::timestamptz - coalesce(c.sales_stage_changed_at, c.created_at))) / 86400.0
        ) as median_days
      from public.clients c
      where c.vertical = ${CLINICS_VERTICAL} and coalesce(c.sales_stage, 'new') not in ('paid', 'lost')
      group by 1
    ),
    avg_paid as (
      select avg(d.payment_amount)::float8 as v from public.deals d
      where d.vertical = ${CLINICS_VERTICAL} and d.paid_at is not null and d.payment_amount > 0
    )
    select
      t.id::text as id, t.sales_stage as stage,
      extract(epoch from (${now}::timestamptz - coalesce(t.sales_stage_changed_at, t.created_at))) / 86400.0 as days_in_stage,
      md.median_days,
      extract(epoch from (${now}::timestamptz - greatest(
        coalesce(t.sales_stage_changed_at, t.created_at), t.created_at,
        coalesce(kc.last_call_at, t.created_at), coalesce(mt.last_meeting_at, t.created_at)
      ))) / 86400.0 as days_since_touch,
      coalesce(kc.answered, 0)::int as answered,
      coalesce(kc.unanswered_streak, 0)::int as unanswered_streak,
      coalesce(kc.positive, 0)::int as positive,
      kc.last_disposition,
      sm.sentiment as last_sentiment,
      sm.recommended_stage,
      coalesce(mt.no_shows, 0)::int as no_shows,
      coalesce(mt.held, 0)::int as held,
      coalesce(mt.upcoming, 0)::int as upcoming,
      t.next_action_at,
      dl.deal_value,
      (select v from avg_paid) as avg_paid
    from target t
    left join medians md on md.stage = coalesce(t.sales_stage, 'new')
    left join lateral (
      select
        max(r.started_at) as last_call_at,
        count(*) filter (where r.answered_at is not null) as answered,
        count(*) filter (where r.disposition in ('discovery_booked', 'demo_booked')) as positive,
        (array_agg(r.disposition order by r.started_at desc) filter (where r.disposition is not null))[1] as last_disposition,
        count(*) filter (
          where r.answered_at is null and r.started_at > coalesce(
            (select max(a.started_at) from public.consultant_calls a where a.client_id = t.id and a.answered_at is not null),
            '-infinity'::timestamptz)
        ) as unanswered_streak
      from (
        select k.started_at, k.answered_at, k.disposition from public.consultant_calls k
        where k.client_id = t.id and k.status in ('completed', 'failed')
        order by k.started_at desc limit ${RECENT_CALLS}
      ) r
    ) kc on true
    left join lateral (
      select k.summary->>'sentiment' as sentiment, k.summary->>'recommendedStage' as recommended_stage
      from public.consultant_calls k
      where k.client_id = t.id and k.summary_status = 'ready' and k.summary is not null
      order by k.started_at desc limit 1
    ) sm on true
    left join lateral (
      select
        count(*) filter (where m.status = 'no_show') as no_shows,
        count(*) filter (where m.status = 'held') as held,
        count(*) filter (where m.status = 'scheduled' and m.starts_at > ${now}::timestamptz) as upcoming,
        max(coalesce(m.status_changed_at, m.created_at)) as last_meeting_at
      from public.consultant_meetings m where m.client_id = t.id
    ) mt on true
    left join lateral (
      select d.deal_value from public.deals d
      where d.client_id = t.id and d.vertical = ${CLINICS_VERTICAL}
      order by d.created_at desc limit 1
    ) dl on true
  `;
  const fallbackAvg = consultantConfig().metrics.defaultAvgSale;
  for (const r of rows) out.set(r.id, toFeatures(r, now, fallbackAvg));
  return out;
}

function oneOf<T extends string>(values: readonly T[], v: unknown): T | null {
  return (values as readonly string[]).includes(String(v)) ? (v as T) : null;
}

function toFeatures(r: FeatureRow, now: Date, fallbackAvg: number): ScoreFeatures {
  const next = r.next_action_at ? new Date(r.next_action_at).getTime() : null;
  const dealValue = r.deal_value == null ? 0 : Number(r.deal_value);
  const avgPaid = r.avg_paid == null ? 0 : Number(r.avg_paid);
  const sentiment = r.last_sentiment;
  return {
    stage: oneOf<SalesStage>(SALES_STAGES, r.stage) ?? "new",
    daysInStage: Math.max(0, Number(r.days_in_stage) || 0),
    medianDaysInStage: r.median_days == null ? null : Number(r.median_days),
    daysSinceLastTouch: Math.max(0, Number(r.days_since_touch) || 0),
    answeredCalls: Number(r.answered),
    unansweredStreak: Number(r.unanswered_streak),
    positiveDispositions: Number(r.positive),
    lastDisposition: oneOf<CallDisposition>(CALL_DISPOSITIONS, r.last_disposition),
    lastSentiment: sentiment === "positive" || sentiment === "neutral" || sentiment === "negative" ? sentiment : null,
    recommendedStage: oneOf<SalesStage>(SALES_STAGES, r.recommended_stage),
    noShows: Number(r.no_shows),
    meetingsHeld: Number(r.held),
    upcomingMeetings: Number(r.upcoming),
    nextAction: next === null ? "none" : next > now.getTime() ? "planned" : "overdue",
    value: dealValue > 0 ? dealValue : avgPaid > 0 ? Math.round(avgPaid) : fallbackAvg,
  };
}

/** Score a batch of leads. Missing / non-Clinics ids are simply absent from the map. */
export async function scoreLeads(db: Sql, leadIds: string[], now: Date = new Date()): Promise<Map<string, DealScore>> {
  const features = await scoreFeatures(db, leadIds, now);
  const out = new Map<string, DealScore>();
  for (const [id, f] of features) out.set(id, scoreDeal(f));
  return out;
}

export async function scoreLead(db: Sql, leadId: string, now: Date = new Date()): Promise<DealScore | null> {
  return (await scoreLeads(db, [leadId], now)).get(leadId) ?? null;
}
