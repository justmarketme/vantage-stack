import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import { buildFunnel, emptyCounts, sumCounts, type FunnelCounts } from "../../metrics/funnel";
import { periodRange, type Range } from "../../metrics/periods";
import { CLINICS_VERTICAL, type CalculatorDefaults, type FunnelMetrics, type GoalMetric, type Period } from "../../types";
import { scoreLeads } from "../scoring/features";
import { getGamificationSettings } from "./settings";

/**
 * Funnel metrics from the database — raw counts only; all derived maths lives in the pure
 * `lib/consultant/metrics/funnel.ts`. Periods are SAST (`metrics/periods.ts`).
 *
 * What each count means, for a half-open range [from, to):
 * - dials         calls STARTED in range (Clinics leads) · connects: of those, answered
 * - conversations answered calls whose talk time ≥ cfg.metrics.conversationMinSec
 * - talkTimeSec   answered → ended seconds (falls back to Twilio's duration)
 * - meetingsBooked discovery/demo meetings CREATED in range · held / noShows: meetings that
 *                  were SCHEDULED to start in range and ended up held / no-show
 * - proposals     deals first sent (sent_at) in range · won: won_at (or accepted_at) in range
 * - paid          deals PAID in range (the sale counts when paid) + revenue + frozen commission
 * - lost          leads moved to `lost` in range (for the win rate in velocity)
 * - cycleDays     lead created → paid, per paid deal
 * - pipeline      NOW (not period-bound): open leads' deal values, weighted by heuristic-v1
 * Attribution is to the consultant on the call / meeting / deal row, so a reassigned lead keeps
 * earlier credit where it was earned.
 */

type Row = { consultant_id: string };
const n = (v: unknown) => Number(v ?? 0) || 0;

export type MetricsScope = { consultantId: string } | "team";

/** Per-consultant raw counts for the range. `consultantId` null = everyone. */
export async function rawCounts(
  db: Sql,
  range: Range,
  consultantId: string | null,
  opts: { pipeline?: boolean } = {},
): Promise<Map<string, FunnelCounts>> {
  const cfg = consultantConfig();
  const from = range.from;
  const to = range.to;
  const whoK = consultantId ? db`k.consultant_id = ${consultantId}::uuid` : db`true`;
  const whoM = consultantId ? db`m.consultant_id = ${consultantId}::uuid` : db`true`;
  const whoD = consultantId ? db`d.consultant_id = ${consultantId}::uuid` : db`d.consultant_id is not null`;
  const whoC = consultantId ? db`c.consultant_id = ${consultantId}::uuid` : db`c.consultant_id is not null`;

  const [calls, meetings, deals, lost] = await Promise.all([
    db<(Row & { dials: number; connects: number; conversations: number; talk: number })[]>`
      select x.consultant_id::text as consultant_id, count(*)::int as dials,
        count(*) filter (where x.answered)::int as connects,
        count(*) filter (where x.answered and x.talk >= ${cfg.metrics.conversationMinSec})::int as conversations,
        coalesce(sum(x.talk), 0)::int as talk
      from (
        select k.consultant_id, k.answered_at is not null as answered,
          case when k.answered_at is not null
            then greatest(0, coalesce(extract(epoch from (k.ended_at - k.answered_at)), k.duration_sec, 0))
            else 0 end as talk
        from public.consultant_calls k
        join public.clients c on c.id = k.client_id and c.vertical = ${CLINICS_VERTICAL}
        where ${whoK} and k.started_at >= ${from}::timestamptz and k.started_at < ${to}::timestamptz
      ) x
      group by 1
    `,
    db<(Row & { booked: number; held: number; no_shows: number })[]>`
      select m.consultant_id::text as consultant_id,
        count(*) filter (where m.created_at >= ${from}::timestamptz and m.created_at < ${to}::timestamptz
                         and m.kind in ('discovery', 'demo'))::int as booked,
        count(*) filter (where m.status = 'held' and m.starts_at >= ${from}::timestamptz and m.starts_at < ${to}::timestamptz)::int as held,
        count(*) filter (where m.status = 'no_show' and m.starts_at >= ${from}::timestamptz and m.starts_at < ${to}::timestamptz)::int as no_shows
      from public.consultant_meetings m
      where ${whoM} and ((m.created_at >= ${from}::timestamptz and m.created_at < ${to}::timestamptz)
                         or (m.starts_at >= ${from}::timestamptz and m.starts_at < ${to}::timestamptz))
      group by 1
    `,
    db<(Row & { proposals: number; won: number; paid: number; revenue: number; commission: number; cycle: (number | string)[] | null })[]>`
      select d.consultant_id::text as consultant_id,
        count(*) filter (where d.sent_at >= ${from}::timestamptz and d.sent_at < ${to}::timestamptz)::int as proposals,
        count(*) filter (where coalesce(d.won_at, d.accepted_at) >= ${from}::timestamptz
                         and coalesce(d.won_at, d.accepted_at) < ${to}::timestamptz)::int as won,
        count(*) filter (where d.paid_at >= ${from}::timestamptz and d.paid_at < ${to}::timestamptz)::int as paid,
        coalesce(sum(d.payment_amount) filter (where d.paid_at >= ${from}::timestamptz and d.paid_at < ${to}::timestamptz), 0)::int as revenue,
        coalesce(sum(d.commission_amount) filter (where d.paid_at >= ${from}::timestamptz and d.paid_at < ${to}::timestamptz), 0)::int as commission,
        array_agg(extract(epoch from (d.paid_at - c.created_at)) / 86400.0)
          filter (where d.paid_at >= ${from}::timestamptz and d.paid_at < ${to}::timestamptz) as cycle
      from public.deals d
      join public.clients c on c.id = d.client_id
      where d.vertical = ${CLINICS_VERTICAL} and ${whoD}
      group by 1
    `,
    db<(Row & { lost: number })[]>`
      select c.consultant_id::text as consultant_id, count(*)::int as lost
      from public.clients c
      where c.vertical = ${CLINICS_VERTICAL} and ${whoC} and c.sales_stage = 'lost'
        and c.sales_stage_changed_at >= ${from}::timestamptz and c.sales_stage_changed_at < ${to}::timestamptz
      group by 1
    `,
  ]);

  const out = new Map<string, FunnelCounts>();
  const get = (id: string) => {
    let c = out.get(id);
    if (!c) out.set(id, (c = emptyCounts()));
    return c;
  };
  for (const r of calls) Object.assign(get(r.consultant_id), { dials: n(r.dials), connects: n(r.connects), conversations: n(r.conversations), talkTimeSec: n(r.talk) });
  for (const r of meetings) Object.assign(get(r.consultant_id), { meetingsBooked: n(r.booked), meetingsHeld: n(r.held), noShows: n(r.no_shows) });
  for (const r of deals) {
    Object.assign(get(r.consultant_id), {
      proposals: n(r.proposals),
      won: n(r.won),
      paid: n(r.paid),
      revenuePaid: n(r.revenue),
      commission: n(r.commission),
      cycleDays: (r.cycle ?? []).map(Number).filter((x) => Number.isFinite(x) && x >= 0),
    });
  }
  for (const r of lost) get(r.consultant_id).lost = n(r.lost);

  if (opts.pipeline) await addPipeline(db, out, consultantId);
  return out;
}

/**
 * Open pipeline as of now: open = stage not paid / lost. Value = the deal's monthly value.
 * Opportunities = open leads past first contact (discovery booked onwards). Weighted value uses
 * each lead's heuristic-v1 win probability.
 */
async function addPipeline(db: Sql, out: Map<string, FunnelCounts>, consultantId: string | null): Promise<void> {
  const who = consultantId ? db`c.consultant_id = ${consultantId}::uuid` : db`c.consultant_id is not null`;
  const rows = await db<{ id: string; consultant_id: string; stage: string | null; value: number | null }[]>`
    select c.id::text, c.consultant_id::text as consultant_id, c.sales_stage as stage, dl.deal_value as value
    from public.clients c
    left join lateral (
      select d.deal_value from public.deals d where d.client_id = c.id and d.vertical = ${CLINICS_VERTICAL}
      order by d.created_at desc limit 1
    ) dl on true
    where c.vertical = ${CLINICS_VERTICAL} and ${who} and coalesce(c.sales_stage, 'new') not in ('paid', 'lost')
    limit ${consultantConfig().limits.listMax * 10}
  `;
  const valued = rows.filter((r) => n(r.value) > 0);
  const scores = await scoreLeads(db, valued.map((r) => r.id));
  for (const r of rows) {
    const c = out.get(r.consultant_id) ?? emptyCounts();
    out.set(r.consultant_id, c);
    if (["discovery_booked", "no_show", "demo_done", "proposal", "won"].includes(r.stage ?? "new")) c.openOpportunities++;
    const v = n(r.value);
    if (v > 0) {
      c.pipelineValue += v;
      c.weightedPipeline += v * (scores.get(r.id)?.winProbability ?? 0);
    }
  }
}

/** Funnel for one consultant, or the whole team, for a SAST period. */
export async function funnel(db: Sql, scope: MetricsScope, period: Period, now: Date = new Date()): Promise<FunnelMetrics> {
  const range = periodRange(period, now);
  const counts = await rawCounts(db, range, scope === "team" ? null : scope.consultantId, { pipeline: true });
  const c = scope === "team" ? sumCounts([...counts.values()]) : (counts.get(scope.consultantId) ?? emptyCounts());
  return buildFunnel(period, range, c);
}

export type TeamMetrics = { team: FunnelMetrics; byConsultant: (FunnelMetrics & { consultantId: string; name: string })[] };

export async function teamFunnel(db: Sql, period: Period, now: Date = new Date()): Promise<TeamMetrics> {
  const range = periodRange(period, now);
  const counts = await rawCounts(db, range, null, { pipeline: true });
  const names = await consultantNames(db, [...counts.keys()]);
  return {
    team: buildFunnel(period, range, sumCounts([...counts.values()])),
    byConsultant: [...counts.entries()]
      .map(([id, c]) => ({ ...buildFunnel(period, range, c), consultantId: id, name: names.get(id) ?? "Consultant" }))
      .sort((a, b) => b.revenuePaid - a.revenuePaid || a.name.localeCompare(b.name)),
  };
}

export async function consultantNames(db: Sql, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db<{ id: string; name: string }[]>`
    select id::text, coalesce(nullif(full_name, ''), username)::text as name from public.team_members where id = any(${ids}::uuid[])
  `;
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Goal progress seam (3B): the value of one metric for one consultant over [fromIso, toIso).
 * Rand for commission/revenue; counts otherwise.
 */
export async function metricValue(db: Sql, consultantId: string, metric: GoalMetric, fromIso: string, toIso: string): Promise<number> {
  const c = (await rawCounts(db, { from: fromIso, to: toIso }, consultantId)).get(consultantId) ?? emptyCounts();
  switch (metric) {
    case "commission":
      return c.commission;
    case "revenue":
      return c.revenuePaid;
    case "deals_paid":
      return c.paid;
    case "dials":
      return c.dials;
    case "connects":
      return c.connects;
    case "meetings_held":
      return c.meetingsHeld;
  }
}

/** Revenue paid per consultant in a range (tier awarding). */
export async function revenueByConsultant(db: Sql, range: Range): Promise<Map<string, number>> {
  const rows = await db<{ consultant_id: string; revenue: number }[]>`
    select d.consultant_id::text as consultant_id, coalesce(sum(d.payment_amount), 0)::int as revenue
    from public.deals d
    where d.vertical = ${CLINICS_VERTICAL} and d.consultant_id is not null
      and d.paid_at >= ${range.from}::timestamptz and d.paid_at < ${range.to}::timestamptz
    group by 1
  `;
  return new Map(rows.map((r) => [r.consultant_id, n(r.revenue)]));
}

/**
 * Calculator defaults for when a consultant has no data yet (so the UI never hard-codes them):
 * config connect rate + average sale, the commission rate, and the LIVE close-ratio target from
 * the gamification settings (editable by Acquisition & Creative).
 */
export async function calculatorDefaults(db: Sql): Promise<CalculatorDefaults> {
  const cfg = consultantConfig();
  const settings = await getGamificationSettings(db);
  return {
    connectRate: cfg.metrics.defaultConnectRate,
    avgSale: cfg.metrics.defaultAvgSale,
    commissionRate: cfg.commission.rate,
    closeTargetFromConnects: settings.closeTargetFromConnects,
  };
}
