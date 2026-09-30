"use client";

import { memo, useMemo, useState } from "react";
import { CloudOff, Pencil, Sparkles } from "lucide-react";
import { useNoteDraft } from "../../../hooks/consultant/useNoteDraft";
import { useOutbox } from "../../../hooks/consultant/useOutbox";
import { useOnline } from "../../../hooks/consultant/useOnline";
import type { Note } from "../../../lib/consultant/types";
import { Button } from "../ui";
import { cx, fmtDateTime, FOCUS, timeAgo } from "../utils";
import { NoteEditor } from "./NoteEditor";
import { NoteHistory } from "./NoteHistory";

type Outbox = ReturnType<typeof useOutbox>;
type Op = Outbox["ops"][number];
type OutboxActions = Pick<Outbox, "enqueue" | "resolve" | "remove">;

/**
 * Notes for a lead (optionally one call). Every write goes through the outbox:
 * online it sends immediately, offline it waits on the device and replays.
 * Queued creates show inline as "Waiting to sync"; edit conflicts are resolved
 * here, never silently overwritten.
 */
export function NoteList({
  leadId,
  callId,
  notes,
  readOnly = false,
  composer = true,
}: {
  leadId: string;
  callId?: string;
  notes: Note[];
  readOnly?: boolean;
  composer?: boolean;
}) {
  const outbox = useOutbox();
  const online = useOnline();
  const { enqueue, resolve, remove } = outbox;
  const actions = useMemo<OutboxActions>(() => ({ enqueue, resolve, remove }), [enqueue, resolve, remove]);

  const pendingCreates = useMemo(
    () =>
      outbox.ops.filter(
        (o): o is Extract<Op, { kind: "note.create" }> =>
          o.kind === "note.create" && o.input.leadId === leadId && (!callId || o.input.callId === callId),
      ),
    [outbox.ops, leadId, callId],
  );
  const patchesByNote = useMemo(() => {
    const m = new Map<string, Extract<Op, { kind: "note.patch" }>>();
    for (const o of outbox.ops) if (o.kind === "note.patch") m.set(o.noteId, o);
    return m;
  }, [outbox.ops]);

  const sorted = useMemo(
    () => [...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [notes],
  );

  return (
    <div className="space-y-3">
      {composer && !readOnly && <NoteComposer leadId={leadId} callId={callId} enqueue={outbox.enqueue} online={online} />}

      {pendingCreates.length > 0 && (
        <ul className="space-y-2">
          {pendingCreates.map((op) => (
            <li key={op.id} className="rounded-2xl border border-dashed border-[--cp-border-strong] bg-[--cp-surface] p-4">
              <p className="whitespace-pre-wrap text-sm text-[--cp-text]">{op.input.body}</p>
              <PendingTag op={op} online={online} onDiscard={() => outbox.remove(op.id)} />
            </li>
          ))}
        </ul>
      )}

      {sorted.length === 0 && pendingCreates.length === 0 ? (
        <p className="text-sm text-[--cp-muted]">No notes yet.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              readOnly={readOnly}
              pendingPatch={patchesByNote.get(n.id)}
              outbox={actions}
              online={online}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function NoteComposer({
  leadId,
  callId,
  enqueue,
  online,
}: {
  leadId: string;
  callId?: string;
  enqueue: Outbox["enqueue"];
  online: boolean;
}) {
  const { draft, setDraft, clear, savedAt } = useNoteDraft(`lead:${leadId}${callId ? `:call:${callId}` : ""}`);
  const save = () => {
    const body = draft.trim();
    if (!body) return;
    enqueue({ kind: "note.create", input: { leadId, callId, body } });
    clear();
  };
  return (
    <NoteEditor
      value={draft}
      onChange={setDraft}
      onSave={save}
      rows={3}
      placeholder="Add a note…"
      saveLabel={online ? "Save note" : "Save offline"}
      status={draft && savedAt ? "Draft saved on this device" : null}
    />
  );
}

function PendingTag({ op, online, onDiscard }: { op: Op; online: boolean; onDiscard?: () => void }) {
  if (op.status === "failed") {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-[--cp-risk]">
        Couldn't save: {op.lastError ?? "rejected by the server"}
        {onDiscard && (
          <button type="button" onClick={onDiscard} className={cx("min-h-11 rounded px-2 underline", FOCUS)}>
            Discard
          </button>
        )}
      </p>
    );
  }
  return (
    <p className="mt-2 flex items-center gap-1.5 text-xs text-[--cp-muted]">
      <CloudOff size={13} aria-hidden /> {online ? "Saving…" : "Waiting for signal — saved on this device"}
    </p>
  );
}

const NoteItem = memo(function NoteItem({
  note,
  readOnly,
  pendingPatch,
  outbox,
  online,
}: {
  note: Note;
  readOnly: boolean;
  pendingPatch?: Extract<Op, { kind: "note.patch" }>;
  outbox: OutboxActions;
  online: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const { draft, setDraft, clear } = useNoteDraft(editing ? `edit:${note.id}` : null);
  const ai = note.kind === "ai_summary";
  const body = pendingPatch && pendingPatch.status !== "conflict" ? pendingPatch.patch.body : note.body;

  const startEdit = () => {
    setDraft((d) => d || body);
    setEditing(true);
  };
  const save = () => {
    const next = draft.trim();
    if (!next) return;
    if (next !== note.body.trim()) {
      outbox.enqueue({ kind: "note.patch", noteId: note.id, leadId: note.leadId, patch: { body: next, baseVersion: note.version } });
    }
    clear();
    setEditing(false);
  };

  return (
    <li className={cx("rounded-2xl border border-[--cp-border] bg-[--cp-surface] p-4", ai && "cp-edge-guide")}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <p className="text-xs text-[--cp-muted]">
          {ai ? (
            <span className="mr-1.5 inline-flex items-center gap-1 rounded-full bg-[--cp-coach-soft] px-2 py-0.5 font-medium text-[--cp-coach]">
              <Sparkles size={12} aria-hidden /> Coach Alex draft
            </span>
          ) : (
            <span className="font-medium text-[--cp-text]">{note.createdBy}</span>
          )}{" "}
          · <time dateTime={note.createdAt} title={fmtDateTime(note.createdAt)}>{timeAgo(note.createdAt)}</time>
        </p>
        {!readOnly && !editing && (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`Edit note from ${fmtDateTime(note.createdAt)}`}
            className={cx("-mr-2 -mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[--cp-muted] hover:text-[--cp-text]", FOCUS)}
          >
            <Pencil size={16} aria-hidden />
          </button>
        )}
      </div>

      {editing ? (
        <NoteEditor
          value={draft}
          onChange={setDraft}
          onSave={save}
          onCancel={() => {
            clear();
            setEditing(false);
          }}
          autoFocus
          label="Edit note"
          saveLabel={online ? "Save" : "Save offline"}
        />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[--cp-text]">{body}</p>
      )}

      {pendingPatch && pendingPatch.status === "conflict" ? (
        <div role="alert" className="mt-3 rounded-xl bg-[--cp-risk-soft] p-3 text-sm text-[--cp-text]">
          <p>{pendingPatch.lastError ?? "Someone else edited this note."} Your version:</p>
          <p className="mt-1 whitespace-pre-wrap text-[--cp-muted]">{pendingPatch.patch.body}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={() => outbox.resolve(pendingPatch.id, { action: "retry", baseVersion: note.version })}>
              Keep mine
            </Button>
            <Button variant="ghost" onClick={() => outbox.resolve(pendingPatch.id, { action: "discard" })}>
              Keep theirs
            </Button>
          </div>
        </div>
      ) : pendingPatch ? (
        <PendingTag op={pendingPatch} online={online} onDiscard={() => outbox.remove(pendingPatch.id)} />
      ) : null}

      {note.updatedBy && note.updatedAt && (
        <p className="mt-2 text-xs text-[--cp-muted]">
          Edited by <span className="text-[--cp-text]">{note.updatedBy}</span> ·{" "}
          <time dateTime={note.updatedAt}>{fmtDateTime(note.updatedAt)}</time>
        </p>
      )}
      {note.version > 1 && <NoteHistory noteId={note.id} version={note.version} />}
    </li>
  );
});
