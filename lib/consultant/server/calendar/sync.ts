import type { Sql } from "postgres";
import { consultantConfig } from "../../config";
import { CALENDAR_PROVIDERS, type CalendarProvider, type CalendarSyncState, type MeetingKind } from "../../types";
import { errorTag } from "../http";
import { iso } from "../util";
import { accessFor, markConnectionError } from "./connections";
import { CALENDAR, CALENDAR_MESSAGES } from "./constants";
import { buildEventSpec } from "./events";
import { googleEventId } from "./google";
import { providerClient } from "./providers";
import { CalendarProviderError } from "./types";

/**
 * Meeting → external calendar sync (Google + Microsoft), designed so a change is never
 * silently dropped:
 *
 * 1. In the SAME transaction as the meeting write, `markMeetingForSync` upserts a `pending`
 *    row in `consultant_meeting_sync` for every provider the consultant has connected.
 * 2. After commit, the request calls `syncMeeting` inline (fast path).
 * 3. Anything still pending/failed — a crash between 1 and 2, a provider outage, a timeout — is
 *    picked up by `retryCalendarSync` (every minute, from 3A's dispatch cron) with exponential
 *    backoff, up to `cfg.calendar.maxSyncAttempts`. After that the row stays `failed` and the
 *    meeting shows "sync failed" in the UI, so a human sees it.
 *
 * Idempotency: Google events get a deterministic id derived from the meeting id and Graph
 * creates carry `transactionId = meeting id`, so an inline attempt racing a cron retry can't
 * create two events. What to do is derived from the meeting's CURRENT state (cancelled →
 * delete, otherwise create-or-update), so retries always converge on the latest version.
 */

/** Seconds to wait before retry n (n = failed attempts so far, ≥ 1). Pure. */
export function backoffSec(attempts: number, baseSec: number = CALENDAR.retryBaseSec, maxSec: number = CALENDAR.retryMaxSec): number {
  const n = Math.max(1, attempts);
  return Math.min(maxSec, baseSec * 2 ** (n - 1));
}

/** Queue every connected provider for this meeting. Call inside the meeting's transaction. */
export async function markMeetingForSync(t: Sql, meetingId: string, consultantId: string): Promise<void> {
  await t`
    insert into public.consultant_meeting_sync (meeting_id, provider, status, attempts, last_error, updated_at)
    select ${meetingId}::uuid, cc.provider, 'pending', 0, null, now()
    from public.consultant_calendar_connections cc
    where cc.consultant_id = ${consultantId}::uuid
    on conflict (meeting_id, provider) do update set status = 'pending', attempts = 0, last_error = null, updated_at = now()
  `;
}

type MeetingSyncRow = {
  id: string;
  client_id: string;
  consultant_id: string;
  kind: MeetingKind;
  status: string;
  starts_at: Date | string;
  ends_at: Date | string;
  invite_clinic: boolean;
  clinic_name: string;
  contact_name: string | null;
  email: string | null;
};

type SyncRow = { provider: CalendarProvider; external_event_id: string | null; status: string; attempts: number };

export type SyncOutcome = "synced" | "failed" | "skipped";

async function loadMeeting(db: Sql, meetingId: string): Promise<MeetingSyncRow | null> {
  const rows = await db<MeetingSyncRow[]>`
    select m.id::text, m.client_id::text, m.consultant_id::text, m.kind, m.status, m.starts_at, m.ends_at,
      m.invite_clinic, coalesce(nullif(c.company, ''), c.name)::text as clinic_name, c.contact_name, c.email::text as email
    from public.consultant_meetings m join public.clients c on c.id = m.client_id
    where m.id = ${meetingId}::uuid
  `;
  return rows[0] ?? null;
}

async function markSynced(db: Sql, meetingId: string, provider: CalendarProvider, externalId: string | null): Promise<void> {
  await db`
    update public.consultant_meeting_sync
    set status = 'synced', external_event_id = ${externalId}, last_error = null, updated_at = now()
    where meeting_id = ${meetingId}::uuid and provider = ${provider}
  `;
}

async function markFailed(db: Sql, meetingId: string, provider: CalendarProvider, err: unknown): Promise<void> {
  const maxAttempts = consultantConfig().calendar.maxSyncAttempts;
  const auth = err instanceof CalendarProviderError && err.kind === "auth";
  await db`
    update public.consultant_meeting_sync
    set status = 'failed', attempts = attempts + 1, updated_at = now(),
      last_error = case
        when ${auth} then ${CALENDAR_MESSAGES.reconnect}
        when attempts + 1 >= ${maxAttempts} then ${CALENDAR_MESSAGES.syncGaveUp}
        else ${CALENDAR_MESSAGES.syncFailed} end
    where meeting_id = ${meetingId}::uuid and provider = ${provider}
  `;
  // Server log: the category only (no ids beyond the provider, no provider text).
  console.warn(`[consultant] calendar sync failed provider=${provider}`, errorTag(err), err instanceof CalendarProviderError ? err.kind : "");
}

/** Sync ONE provider for ONE meeting. Never throws; the outcome is recorded on the sync row. */
export async function syncMeetingProvider(db: Sql, meetingId: string, provider: CalendarProvider): Promise<SyncOutcome> {
  const meeting = await loadMeeting(db, meetingId);
  if (!meeting) return "skipped"; // meeting deleted (cascade removes the sync rows)
  const rows = await db<SyncRow[]>`
    select provider, external_event_id, status, attempts from public.consultant_meeting_sync
    where meeting_id = ${meetingId}::uuid and provider = ${provider}
  `;
  const row = rows[0];
  if (!row) return "skipped";

  try {
    const access = await accessFor(db, meeting.consultant_id, provider);
    if (!access) {
      // Not connected / needs reconnect: count it so the row doesn't sit pending forever.
      await markFailed(db, meetingId, provider, new CalendarProviderError("auth", null));
      return "failed";
    }
    const client = providerClient(provider);
    const spec = buildEventSpec(
      {
        meetingId: meeting.id,
        kind: meeting.kind,
        startsAt: iso(meeting.starts_at)!,
        endsAt: iso(meeting.ends_at)!,
        inviteClinic: meeting.invite_clinic,
        leadId: meeting.client_id,
        clinicName: meeting.clinic_name,
        contactName: meeting.contact_name,
        email: meeting.email,
      },
      consultantConfig().publicUrl,
    );

    if (meeting.status === "cancelled") {
      if (row.external_event_id) {
        await client.deleteEvent(access.accessToken, access.calendarId, row.external_event_id, !!spec.attendee);
      }
      await markSynced(db, meetingId, provider, row.external_event_id);
      return "synced";
    }

    let externalId = row.external_event_id;
    if (externalId) {
      try {
        await client.updateEvent(access.accessToken, access.calendarId, externalId, spec);
      } catch (e) {
        // Someone deleted it in their calendar app: put it back.
        if (!(e instanceof CalendarProviderError && e.kind === "not_found")) throw e;
        externalId = null;
      }
    }
    if (!externalId) {
      try {
        externalId = await client.createEvent(access.accessToken, access.calendarId, spec);
      } catch (e) {
        // Google: our deterministic id already exists (a racing attempt created it) → update it.
        if (provider === "google" && e instanceof CalendarProviderError && e.kind === "conflict") {
          externalId = googleEventId(meeting.id);
          await client.updateEvent(access.accessToken, access.calendarId, externalId, spec);
        } else {
          throw e;
        }
      }
    }
    await markSynced(db, meetingId, provider, externalId);
    return "synced";
  } catch (e) {
    if (e instanceof CalendarProviderError && e.kind === "auth") await markConnectionError(db, meeting.consultant_id, provider);
    await markFailed(db, meetingId, provider, e);
    return "failed";
  }
}

/** Inline fast path after a meeting write: every provider with a pending row. Never throws. */
export async function syncMeeting(db: Sql, meetingId: string): Promise<void> {
  try {
    const rows = await db<{ provider: CalendarProvider }[]>`
      select provider from public.consultant_meeting_sync
      where meeting_id = ${meetingId}::uuid and status = 'pending'
    `;
    await Promise.all(rows.map((r) => syncMeetingProvider(db, meetingId, r.provider)));
  } catch (e) {
    // The rows stay pending; the retry cron will pick them up.
    console.warn("[consultant] calendar inline sync deferred", errorTag(e));
  }
}

/**
 * Meeting.sync for a list of meetings: per provider, `not_connected` when the consultant has no
 * connection, else the sync row's state (`pending` until the first attempt lands). A connection
 * in the error state shows `failed` unless that meeting already synced.
 */
export async function syncStates(
  db: Sql,
  meetings: { id: string; consultantId: string }[],
): Promise<Map<string, Record<CalendarProvider, CalendarSyncState>>> {
  const out = new Map<string, Record<CalendarProvider, CalendarSyncState>>();
  if (!meetings.length) return out;
  const consultantIds = [...new Set(meetings.map((m) => m.consultantId))];
  const meetingIds = meetings.map((m) => m.id);
  const [conns, rows] = await Promise.all([
    db<{ consultant_id: string; provider: string; status: string }[]>`
      select consultant_id::text, provider, status from public.consultant_calendar_connections
      where consultant_id = any(${consultantIds}::uuid[])`,
    db<{ meeting_id: string; provider: string; status: string }[]>`
      select meeting_id::text, provider, status from public.consultant_meeting_sync
      where meeting_id = any(${meetingIds}::uuid[])`,
  ]);
  for (const m of meetings) {
    const rec = {} as Record<CalendarProvider, CalendarSyncState>;
    for (const p of CALENDAR_PROVIDERS) {
      const conn = conns.find((c) => c.consultant_id === m.consultantId && c.provider === p);
      const row = rows.find((r) => r.meeting_id === m.id && r.provider === p);
      rec[p] = syncStateFor(conn?.status ?? null, row?.status ?? null);
    }
    out.set(m.id, rec);
  }
  return out;
}

/** Pure mapping behind `syncStates`. */
export function syncStateFor(connectionStatus: string | null, rowStatus: string | null): CalendarSyncState {
  if (!connectionStatus) return "not_connected";
  if (rowStatus === "synced") return "synced";
  if (connectionStatus === "error" || rowStatus === "failed") return "failed";
  return "pending";
}
