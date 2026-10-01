import type { Sql } from "postgres";
import { CLINICS_VERTICAL, type TodayStats } from "../../types";
import { TIMINGS } from "../constants";

/**
 * Today's numbers for one consultant (or, for the legacy admin with no member id and no
 * `consultantId`, the whole team). "Today" is the calendar day in TIMINGS.statsTimeZone.
 * - dials: calls started today · connects: of those, answered
 * - talkTimeSec: answered → ended seconds (falls back to Twilio's duration)
 * - discoveryBooked / demosBooked: today's calls wrapped up with that disposition
 * - dueFollowUps: open leads whose next action is due by the end of today
 */
export async function todayStats(db: Sql, consultantId: string | null): Promise<TodayStats> {
  const tz = TIMINGS.statsTimeZone;
  const who = consultantId ? db`k.consultant_id = ${consultantId}::uuid` : db`true`;
  const whoLead = consultantId ? db`c.consultant_id = ${consultantId}::uuid` : db`c.consultant_id is not null`;
  const [calls] = await db<
    { dials: number; connects: number; talk: number; discovery: number; demos: number }[]
  >`
    with bounds as (select (date_trunc('day', now() at time zone ${tz}) at time zone ${tz}) as start_at)
    select
      count(*)::int as dials,
      count(*) filter (where k.answered_at is not null)::int as connects,
      coalesce(sum(
        case when k.answered_at is not null then
          coalesce(extract(epoch from (k.ended_at - k.answered_at)), k.duration_sec, 0)
        else 0 end
      ), 0)::int as talk,
      count(*) filter (where k.disposition = 'discovery_booked')::int as discovery,
      count(*) filter (where k.disposition = 'demo_booked')::int as demos
    from public.consultant_calls k, bounds b
    where ${who} and k.started_at >= b.start_at
  `;
  const [due] = await db<{ n: number }[]>`
    with bounds as (select ((date_trunc('day', now() at time zone ${tz}) + interval '1 day') at time zone ${tz}) as end_at)
    select count(*)::int as n
    from public.clients c, bounds b
    where c.vertical = ${CLINICS_VERTICAL} and ${whoLead}
      and c.next_action_at is not null and c.next_action_at < b.end_at
      and coalesce(c.sales_stage, 'new') not in ('won', 'lost')
  `;
  return {
    dials: calls?.dials ?? 0,
    connects: calls?.connects ?? 0,
    talkTimeSec: Math.max(0, calls?.talk ?? 0),
    discoveryBooked: calls?.discovery ?? 0,
    demosBooked: calls?.demos ?? 0,
    dueFollowUps: due?.n ?? 0,
  };
}
