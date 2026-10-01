import type { Sql } from "postgres";
import type { ConsultantSession } from "../../auth/session";
import { consultantConfig } from "../../config";
import { CLINICS_VERTICAL, type Note, type NoteInput, type NotePatch, type NoteRevision } from "../../types";
import { CRM_FEED, MESSAGES } from "../constants";
import { logActivity } from "../crmFeed";
import { fail, txSql } from "../http";
import { toNote, toRevision, type NoteRow, type RevisionRow } from "../mappers";
import { leadVisible, writerId, type Scope } from "./scope";

type Session = Pick<ConsultantSession, "memberId" | "isManager" | "username" | "displayName">;

const NOTE_COLUMNS = "n.id::text as id, n.client_id::text as client_id, n.call_id::text as call_id, n.kind, n.body, n.version, n.created_by_name, n.created_at, n.updated_by_name, n.updated_at";

export async function listNotes(db: Sql, by: { leadId: string } | { callId: string }): Promise<Note[]> {
  const where = "leadId" in by ? db`n.client_id = ${by.leadId}::uuid` : db`n.call_id = ${by.callId}::uuid`;
  const rows = await db<NoteRow[]>`
    select ${db.unsafe(NOTE_COLUMNS)} from public.consultant_notes n
    where ${where}
    order by n.created_at desc
    limit ${consultantConfig().limits.listMax}
  `;
  return rows.map(toNote);
}

async function getVisibleNote(db: Sql, s: Scope, id: string, lock = false): Promise<NoteRow> {
  const rows = await db<NoteRow[]>`
    select ${db.unsafe(NOTE_COLUMNS)} from public.consultant_notes n
    join public.clients c on c.id = n.client_id and c.vertical = ${CLINICS_VERTICAL}
    where n.id = ${id}::uuid and ${leadVisible(db, s)}
    ${lock ? db`for update of n` : db``}
  `;
  if (!rows[0]) fail(404, MESSAGES.noteNotFound);
  return rows[0];
}

/**
 * Create a manual note. Idempotent on `clientId` (the offline outbox's replay key): a replay
 * returns the note the first request created, provided it belongs to the same lead.
 */
export async function createNote(db: Sql, s: Session, input: NoteInput): Promise<Note> {
  const memberId = writerId(s);
  return db.begin(async (tx) => {
    const t = txSql(tx);
    const lead = await t`
      select 1 from public.clients c
      where c.id = ${input.leadId}::uuid and c.vertical = ${CLINICS_VERTICAL} and ${leadVisible(t, s)}
    `;
    if (!lead.length) fail(404, MESSAGES.leadNotFound);
    if (input.callId) {
      const call = await t`
        select 1 from public.consultant_calls where id = ${input.callId}::uuid and client_id = ${input.leadId}::uuid
      `;
      if (!call.length) fail(400, MESSAGES.badRequest, { callId: MESSAGES.callNotFound });
    }
    const inserted = await t<NoteRow[]>`
      insert into public.consultant_notes as n (client_id, call_id, kind, body, created_by, created_by_name, client_request_id)
      values (${input.leadId}::uuid, ${input.callId ?? null}::uuid, 'manual', ${input.body}, ${memberId}::uuid,
        ${s.displayName}, ${input.clientId ?? null}::uuid)
      on conflict (client_request_id) where client_request_id is not null do nothing
      returning ${t.unsafe(NOTE_COLUMNS)}
    `;
    if (inserted[0]) {
      await logActivity(t, CRM_FEED.activity.note, input.leadId, s.username, {
        note_id: inserted[0].id,
        call_id: input.callId ?? null,
        kind: "manual",
      });
      return toNote(inserted[0]);
    }
    // Replay of an offline-queued create.
    const existing = await t<NoteRow[]>`
      select ${t.unsafe(NOTE_COLUMNS)} from public.consultant_notes n
      where n.client_request_id = ${input.clientId ?? null}::uuid and n.client_id = ${input.leadId}::uuid
    `;
    if (!existing[0]) fail(409, MESSAGES.noteConflict);
    return toNote(existing[0]);
  });
}

/**
 * Edit a note with optimistic concurrency. The previous version is kept as a revision
 * (backfilled the first time a note is edited, so v1 is never lost) and the new version is
 * recorded with editor + time — `revisions` is the complete history, newest first.
 */
export async function patchNote(db: Sql, s: Session, id: string, patch: NotePatch): Promise<Note> {
  const memberId = writerId(s);
  return db.begin(async (tx) => {
    const t = txSql(tx);
    const note = await getVisibleNote(t, s, id, true);
    if (note.version !== patch.baseVersion) fail(409, MESSAGES.noteConflict, { baseVersion: MESSAGES.noteConflict });

    await t`
      insert into public.consultant_note_revisions (note_id, version, body, edited_by, edited_by_name, edited_at)
      select n.id, n.version, n.body, coalesce(n.updated_by, n.created_by),
        coalesce(n.updated_by_name, n.created_by_name), coalesce(n.updated_at, n.created_at)
      from public.consultant_notes n where n.id = ${id}::uuid
      on conflict (note_id, version) do nothing
    `;
    const rows = await t<NoteRow[]>`
      update public.consultant_notes as n
      set body = ${patch.body}, version = n.version + 1, updated_by = ${memberId}::uuid,
        updated_by_name = ${s.displayName}, updated_at = now()
      where n.id = ${id}::uuid
      returning ${t.unsafe(NOTE_COLUMNS)}
    `;
    const updated = rows[0];
    await t`
      insert into public.consultant_note_revisions (note_id, version, body, edited_by, edited_by_name, edited_at)
      values (${id}::uuid, ${updated.version}, ${updated.body}, ${memberId}::uuid, ${s.displayName}, ${updated.updated_at ?? new Date()})
      on conflict (note_id, version) do nothing
    `;
    await logActivity(t, CRM_FEED.activity.note, updated.client_id, s.username, {
      note_id: id,
      call_id: updated.call_id,
      kind: updated.kind,
      version: updated.version,
      edit: true,
    });
    return toNote(updated);
  });
}

/**
 * Full history, newest first. Element 0 is ALWAYS the note's current version (the offline
 * outbox's conflict de-dup relies on it): stored revisions cover every edited version, and a
 * never-edited note (or Coach Alex's un-edited v1 draft) gets its current text synthesised.
 */
export async function listRevisions(db: Sql, s: Scope, id: string): Promise<NoteRevision[]> {
  const note = await getVisibleNote(db, s, id);
  const rows = await db<RevisionRow[]>`
    select version, body, edited_by_name, edited_at from public.consultant_note_revisions
    where note_id = ${id}::uuid and version <= ${note.version} order by version desc
  `;
  return withCurrentFirst(note, rows.map(toRevision));
}

/** Pure: make sure the note's current version/body heads the revision list. */
export function withCurrentFirst(note: NoteRow, revisions: NoteRevision[]): NoteRevision[] {
  const current = toRevision({
    version: note.version,
    body: note.body,
    edited_by_name: note.updated_by_name ?? note.created_by_name,
    edited_at: note.updated_at ?? note.created_at,
  });
  return [current, ...revisions.filter((r) => r.version !== note.version)];
}

/**
 * Coach Alex's editable draft for a call. Inserted once per call (unique partial index on
 * call_id where kind = 'ai_summary'); a re-run refreshes it only while no human has edited it
 * (version = 1). Returns true when the note body was written.
 */
export async function upsertAiSummaryNote(
  db: Sql,
  input: { clientId: string; callId: string; body: string },
): Promise<boolean> {
  const rows = await db`
    insert into public.consultant_notes as n (client_id, call_id, kind, body, created_by_name)
    values (${input.clientId}::uuid, ${input.callId}::uuid, 'ai_summary', ${input.body}, ${CRM_FEED.coachName})
    on conflict (call_id) where kind = 'ai_summary'
    do update set body = excluded.body
    where n.version = 1
    returning n.id
  `;
  return rows.length > 0;
}
