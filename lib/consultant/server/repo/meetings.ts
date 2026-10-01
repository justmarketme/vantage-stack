import type { Sql } from "postgres";
import type { ConsultantSession } from "../../auth/session";
import { consultantConfig } from "../../config";
import {
  MEETING_KINDS,
  MEETING_STATUSES,
  type CalendarProvider,
  type CalendarSyncState,
  type Meeting,
  type MeetingInput,
  type MeetingKind,
  type MeetingPatch,
  type MeetingStatus,
  type SalesStage,
} from "../../types";
import { sastLabel, sastStartOfDay } from "../calendar/sast";
import { markMeetingForSync, syncMeeting, syncStates } from "../calendar/sync";
import { CRM_FEED, MESSAGES } from "../constants";
import { logActivity } from "../crmFeed";
import { fail, isUuid, txSql } from "../http";
import { canChangeStatus, stageAfterBooking, stageAfterStatus } from "../meetingStages";
import { auditSafe, kick } from "../sideEffects";
import { iso } from "../util";
import { applyLeadPatch, lockLead } from "./leads";
import { leadVisible, writerId, type Scope } from "./scope";

/**
 * Discovery / demo / follow-up meetings on a Clinics lead.
 *
 * Scope follows leads: a consultant sees meetings on leads they can see (own + pool) plus any
 * meeting they own; managers see all. Writes: the meeting's consultant, the lead's owner, or a
 * manager. Every write runs in ONE transaction with the lead's stage automation and the
 * calendar-sync queue rows, so a meeting can never exist without its stage move or its sync
 * intent. After commit: kick the event dispatcher (the DB triggers already wrote
 * `meeting.*` + `lead.stage_changed` events), then try the calendar sync inline.
 */

type Session = Pick<ConsultantSession, "memberId" | "isManager" | "username">;

// TODO(contract-request 3B-CR-3): move into constants.MESSAGES / cfg.messages.
export const MEETING_MESSAGES = {
  notFound: "Meeting not found.",
  inPast: "Choose a start time in the future (SAST).",
  notYours: "Only the consultant on this meeting or a manager can change it.",
  cancelledFinal: "This meeting was cancelled. Book a new one instead.",
  notStarted: "You can only mark a meeting held or no-show once it has started.",
  rescheduleClosed: "Only a scheduled meeting can be moved.",
  badRange: "Use ISO dates with an offset for from / to.",
} as const;

/** Default list window when no lead is given: from the start of today (SAST) for this many days. */
const DEFAULT_WINDOW_DAYS = 60;

type MeetingRow = {
  id: string;
  client_id: string;
  clinic_name: string;
  consultant_id: string;
  kind: string;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  notes: string | null;
  created_at: Date | string;
};

function oneOf<T extends string>(values: readonly T[], v: unknown, fallback: T): T {
  return (values as readonly string[]).includes(String(v)) ? (v as T) : fallback;
}

export function toMeeting(r: MeetingRow, sync: Record<CalendarProvider, CalendarSyncState>): Meeting {
  return {
    id: r.id,
    leadId: r.client_id,
    clinicName: r.clinic_name,
    consultantId: r.consultant_id,
    kind: oneOf<MeetingKind>(MEETING_KINDS, r.kind, "discovery"),
    status: oneOf<MeetingStatus>(MEETING_STATUSES, r.status, "scheduled"),
    startsAt: iso(r.starts_at)!,
    endsAt: iso(r.ends_at)!,
    notes: r.notes,
    sync,
    createdAt: iso(r.created_at)!,
  };
}

function meetingSelect(db: Sql) {
  return db`
    select m.id::text, m.client_id::text, coalesce(nullif(c.company, ''), c.name)::text as clinic_name,
      m.consultant_id::text, m.kind, m.status, m.starts_at, m.ends_at, m.notes, m.created_at
    from public.consultant_meetings m
    join public.clients c on c.id = m.client_id
  `;
}

function meetingVisible(db: Sql, s: Scope) {
  if (s.isManager) return db`true`;
  return s.memberId ? db`(${leadVisible(db, s)} or m.consultant_id = ${s.memberId}::uuid)` : leadVisible(db, s);
}

async function withSync(db: Sql, rows: MeetingRow[]): Promise<Meeting[]> {
  const states = await syncStates(db, rows.map((r) => ({ id: r.id, consultantId: r.consultant_id })));
  return rows.map((r) => toMeeting(r, states.get(r.id)!));
}

export type MeetingListQuery = { from?: Date; to?: Date; leadId?: string };

/** `?from=&to=&leadId=` — strict: bad values are a 400, never silently ignored. */
export function parseMeetingQuery(sp: URLSearchParams): MeetingListQuery {
  const fields: Record<string, string> = {};
  const out: MeetingListQuery = {};
  for (const key of ["from", "to"] as const) {
    const v = sp.get(key);
    if (!v) continue;
    const d = /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : new Date(Number.NaN);
    if (Number.isNaN(d.getTime())) fields[key] = MEETING_MESSAGES.badRange;
    else out[key] = d;
  }
  const leadId = sp.get("leadId");
  if (leadId) {
    if (!isUuid(leadId)) fields.leadId = MESSAGES.leadNotFound;
    else out.leadId = leadId.toLowerCase();
  }
  if (Object.keys(fields).length) fail(400, MESSAGES.badRequest, fields);
  return out;
}

export async function listMeetings(db: Sql, s: Scope, q: MeetingListQuery, now: Date = new Date()): Promise<Meeting[]> {
  // A lead's meeting history is shown whole; otherwise default to the upcoming window.
  const from = q.from ?? (q.leadId ? null : sastStartOfDay(now));
  const to = q.to ?? (q.leadId || !from ? null : new Date(from.getTime() + DEFAULT_WINDOW_DAYS * 86_400_000));
  const rows = await db<MeetingRow[]>`
    ${meetingSelect(db)}
    where ${meetingVisible(db, s)}
      and (${q.leadId ?? null}::uuid is null or m.client_id = ${q.leadId ?? null}::uuid)
      and (${from}::timestamptz is null or m.starts_at >= ${from}::timestamptz)
      and (${to}::timestamptz is null or m.starts_at < ${to}::timestamptz)
    order by m.starts_at ${q.leadId ? db`desc` : db`asc`}
    limit ${consultantConfig().limits.listMax}
  `;
  return withSync(db, rows);
}

export async function getMeeting(db: Sql, s: Scope, id: string): Promise<Meeting | null> {
  const rows = await db<MeetingRow[]>`${meetingSelect(db)} where m.id = ${id}::uuid and ${meetingVisible(db, s)}`;
  return rows[0] ? (await withSync(db, rows))[0] : null;
}

function requireFuture(startsAt: Date, now: Date): void {
  if (!(startsAt.getTime() > now.getTime())) fail(400, MEETING_MESSAGES.inPast, { startsAt: MEETING_MESSAGES.inPast });
}

export async function createMeeting(db: Sql, s: Session, input: MeetingInput, now: Date = new Date()): Promise<Meeting> {
  const memberId = writerId(s);
  const startsAt = new Date(input.startsAt);
  requireFuture(startsAt, now);
  const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);

  const { id, stageMoved } = await db.begin(async (tx) => {
    const t = txSql(tx);
    const lead = await lockLead(t, s, input.leadId); // 404 unless the caller can see the lead

    // Booking a meeting on an unassigned pool lead claims it for the booker.
    let owner = lead.consultant_id;
    if (!owner) {
      await t`
        update public.clients set consultant_id = ${memberId}::uuid, assigned_to = ${s.username}, updated_at = now()
        where id = ${input.leadId}::uuid and consultant_id is null
      `;
      await logActivity(t, CRM_FEED.activity.leadClaimed, input.leadId, s.username, { consultant_id: memberId, source: "meeting" });
      owner = memberId;
    }

    // The meeting (and its calendar event) belongs to the lead's owner — a manager booking on a
    // rep's lead puts it in the rep's calendar.
    const rows = await t<{ id: string }[]>`
      insert into public.consultant_meetings (client_id, consultant_id, kind, status, starts_at, ends_at, invite_clinic, notes)
      values (${input.leadId}::uuid, ${owner}::uuid, ${input.kind}, 'scheduled', ${startsAt}, ${endsAt},
        ${input.inviteClinic}, ${input.notes ?? null})
      returning id::text
    `;
    const meetingId = rows[0].id;

    const next = stageAfterBooking(input.kind, (lead.sales_stage ?? "new") as SalesStage);
    if (next) await applyLeadPatch(t, s, input.leadId, { salesStage: next }, { source: "lead" });
    await markMeetingForSync(t, meetingId, owner);
    return { id: meetingId, stageMoved: next };
  });

  kick();
  await syncMeeting(db, id);
  await auditSafe(db, {
    actorId: memberId,
    actorKind: "member",
    action: "meeting.create",
    entity: "meeting",
    entityId: id,
    meta: { leadId: input.leadId, kind: input.kind, stageMoved },
  });
  const m = await getMeeting(db, s, id);
  if (!m) fail(404, MEETING_MESSAGES.notFound);
  return m;
}

type LockedMeeting = {
  id: string;
  client_id: string;
  consultant_id: string;
  kind: MeetingKind;
  status: MeetingStatus;
  starts_at: Date;
  ends_at: Date;
  lead_owner: string | null;
  lead_stage: string | null;
  lead_visible: boolean;
};

export async function patchMeeting(db: Sql, s: Session, id: string, patch: MeetingPatch, now: Date = new Date()): Promise<Meeting> {
  const memberId = writerId(s);

  const { needsSync, statusChanged, stageMoved } = await db.begin(async (tx) => {
    const t = txSql(tx);
    const rows = await t<LockedMeeting[]>`
      select m.id::text, m.client_id::text, m.consultant_id::text, m.kind, m.status, m.starts_at, m.ends_at,
        c.consultant_id::text as lead_owner, c.sales_stage as lead_stage, ${leadVisible(t, s)} as lead_visible
      from public.consultant_meetings m join public.clients c on c.id = m.client_id
      where m.id = ${id}::uuid and ${meetingVisible(t, s)}
      for update of m
    `;
    const m = rows[0];
    if (!m) fail(404, MEETING_MESSAGES.notFound);
    if (!s.isManager && m.consultant_id !== memberId && m.lead_owner !== memberId) fail(403, MEETING_MESSAGES.notYours);
    if (m.status === "cancelled") fail(409, MEETING_MESSAGES.cancelledFinal);

    const updates: Record<string, unknown> = {};
    let timeChanged = false;

    if (patch.startsAt !== undefined || patch.durationMin !== undefined) {
      if (m.status !== "scheduled" || (patch.status && patch.status !== "scheduled")) fail(409, MEETING_MESSAGES.rescheduleClosed);
      const start = patch.startsAt !== undefined ? new Date(patch.startsAt) : new Date(m.starts_at);
      const durMin = patch.durationMin ?? Math.round((new Date(m.ends_at).getTime() - new Date(m.starts_at).getTime()) / 60_000);
      requireFuture(start, now);
      updates.starts_at = start;
      updates.ends_at = new Date(start.getTime() + durMin * 60_000);
      timeChanged = true;
    }
    if (patch.notes !== undefined) updates.notes = patch.notes || null;

    const to = patch.status;
    const changed = to !== undefined && to !== m.status;
    if (changed) {
      if (!canChangeStatus(m.status, to)) fail(409, MEETING_MESSAGES.cancelledFinal);
      if ((to === "held" || to === "no_show") && new Date(m.starts_at).getTime() > now.getTime()) {
        fail(400, MEETING_MESSAGES.notStarted, { status: MEETING_MESSAGES.notStarted });
      }
      updates.status = to;
      updates.status_changed_at = now;
    }

    if (Object.keys(updates).length) {
      updates.updated_at = now;
      await t`update public.consultant_meetings set ${t(updates)} where id = ${id}::uuid`;
    }

    let next: SalesStage | null = null;
    if (changed && m.lead_visible) {
      next = stageAfterStatus(m.kind, to, (m.lead_stage ?? "new") as SalesStage);
      if (next) await applyLeadPatch(t, s, m.client_id, { salesStage: next }, { source: "lead" });
    }

    // Calendar: a new time → update the event; cancelled → delete it. Held / no-show / notes
    // don't touch the calendar (notes never go into the event description).
    const sync = timeChanged || (changed && to === "cancelled");
    if (sync) await markMeetingForSync(t, id, m.consultant_id);
    return { needsSync: sync, statusChanged: changed ? to : null, stageMoved: next };
  });

  kick();
  if (needsSync) await syncMeeting(db, id);
  await auditSafe(db, {
    actorId: memberId,
    actorKind: "member",
    action: "meeting.update",
    entity: "meeting",
    entityId: id,
    meta: { status: statusChanged, rescheduled: patch.startsAt !== undefined || patch.durationMin !== undefined, stageMoved },
  });
  const out = await getMeeting(db, s, id);
  if (!out) fail(404, MEETING_MESSAGES.notFound);
  return out;
}

/** Human SAST label, re-exported for route/UI messages. */
export { sastLabel };
