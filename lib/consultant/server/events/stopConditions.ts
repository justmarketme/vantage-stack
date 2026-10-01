import type { Sql } from "postgres";
import { SALES_STAGES, type SalesStage, type StopCondition } from "../../types";

/**
 * Stop conditions for Emma's follow-up sequences.
 *
 * n8n only handles TIMING: it waits, then asks the app to send step N of a sequence. The app
 * has the data, so it decides here whether that message still makes sense — e.g. a no-show
 * re-engagement is pointless if the clinic already replied or rebooked. Keeping this in the
 * app (not in n8n) means the rules are tested, versioned and can never drift from the data.
 */

/** What the world looked like when the sequence started, and what it looks like now. */
export type StopState = {
  /** When the triggering event happened. */
  eventAt: Date;
  /** Lead stage at event time (from the event payload). */
  stageAtEvent: SalesStage | null;
  /** Meeting time recorded in the event (reminders / no-shows), if any. */
  meetingStartsAtEvent: string | null;
  currentStage: SalesStage;
  optedOut: boolean;
  /** Latest inbound WhatsApp/SMS reply from this lead, if any. */
  lastReplyAt: Date | null;
  /** The meeting named in the event, as it is now (null when the event has no meeting). */
  meeting: { status: string; startsAt: string } | null;
};

const order = (s: SalesStage | null): number => (s ? SALES_STAGES.indexOf(s) : -1);

/** Returns the FIRST condition that is now true, or null if the step should go ahead. */
export function firstStop(state: StopState, stopIf: readonly StopCondition[]): StopCondition | null {
  for (const c of stopIf) {
    switch (c) {
      case "opted_out":
        if (state.optedOut) return c;
        break;
      case "lead_lost":
        if (state.currentStage === "lost") return c;
        break;
      case "lead_replied":
        if (state.lastReplyAt && state.lastReplyAt > state.eventAt) return c;
        break;
      case "meeting_held":
        if (state.meeting?.status === "held") return c;
        break;
      case "meeting_rescheduled": {
        // Cancelled, or moved to a different time than the one this reminder was built for.
        const m = state.meeting;
        if (!m) break;
        if (m.status === "cancelled") return c;
        if (state.meetingStartsAtEvent && new Date(m.startsAt).getTime() !== new Date(state.meetingStartsAtEvent).getTime()) return c;
        break;
      }
      case "stage_advanced":
        // "Advanced" = moved forward in the pipeline since the event. Lost is not progress
        // (lead_lost covers it), and no_show sits before demo_done in SALES_STAGES order.
        if (state.currentStage !== "lost" && order(state.currentStage) > order(state.stageAtEvent)) return c;
        break;
    }
  }
  return null;
}

type EventRow = { occurred_at: Date; payload: { lead?: { stage?: string } | null; data?: Record<string, unknown> } };

/** Loads the StopState for a lead from the triggering event. Null if the event is unknown. */
export async function loadStopState(db: Sql, leadId: string, eventId: string): Promise<StopState | null> {
  const ev = await db<EventRow[]>`
    select occurred_at, payload from public.consultant_events
    where id = ${eventId}::uuid and client_id = ${leadId}::uuid
  `;
  if (!ev[0]) return null;
  const data = ev[0].payload?.data ?? {};
  const meetingId = typeof data.meetingId === "string" ? data.meetingId : null;
  const meetingStartsAtEvent = typeof data.startsAt === "string" ? data.startsAt : null;

  const [lead] = await db<{ stage: string | null; opted_out: boolean }[]>`
    select coalesce(c.sales_stage, 'new') as stage,
           coalesce(cc.opted_out_at is not null, false) as opted_out
    from public.clients c
    left join public.consultant_contact_consent cc on cc.client_id = c.id
    where c.id = ${leadId}::uuid
  `;
  if (!lead) return null;

  // Inbound replies are recorded in the audit log by the Emma inbound webhook (no bodies stored).
  const [reply] = await db<{ at: Date | null }[]>`
    select max(at) as at from public.consultant_audit_log
    where action = 'emma.inbound_reply' and entity = 'lead' and entity_id = ${leadId}
  `;

  let meeting: StopState["meeting"] = null;
  if (meetingId) {
    const [m] = await db<{ status: string; starts_at: Date }[]>`
      select status, starts_at from public.consultant_meetings where id = ${meetingId}::uuid
    `;
    if (m) meeting = { status: m.status, startsAt: m.starts_at.toISOString() };
  }

  const stageAt = ev[0].payload?.lead?.stage;
  return {
    eventAt: ev[0].occurred_at,
    stageAtEvent: (SALES_STAGES as readonly string[]).includes(stageAt ?? "") ? (stageAt as SalesStage) : null,
    meetingStartsAtEvent,
    currentStage: (SALES_STAGES as readonly string[]).includes(lead.stage ?? "") ? (lead.stage as SalesStage) : "new",
    optedOut: lead.opted_out,
    lastReplyAt: reply?.at ?? null,
    meeting,
  };
}
