"use client";

import { useId, useState } from "react";
import { ChevronDown, History } from "lucide-react";
import { api } from "../../../lib/consultant/client/api";
import { useQuery } from "../../../hooks/consultant/useQuery";
import type { NoteRevision } from "../../../lib/consultant/types";
import { ErrorState, Skeleton } from "../ui";
import { cx, describeError, fmtDateTime, FOCUS } from "../utils";

/**
 * "History" disclosure: every revision of a note, newest first, with editor +
 * timestamp. Fetched only when opened; never persisted (note bodies).
 */
export function NoteHistory({ noteId, version }: { noteId: string; version: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const revs = useQuery<NoteRevision[]>(open ? `revisions:${noteId}:${version}` : null, () => api.notes.revisions(noteId));

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cx("inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs text-[--cp-muted] hover:text-[--cp-text]", FOCUS)}
      >
        <History size={14} aria-hidden />
        History · {version} {version === 1 ? "version" : "versions"}
        <ChevronDown size={14} aria-hidden className={cx("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={id} className="mt-1 space-y-2">
          {revs.loading ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : revs.error && !revs.data ? (
            <ErrorState message={describeError(revs.error, "load")} onRetry={() => void revs.refresh()} />
          ) : (
            <ol className="space-y-2">
              {(revs.data ?? []).map((r) => (
                <li key={r.version} className="rounded-xl bg-[--cp-surface-2] p-3">
                  <p className="text-xs text-[--cp-muted]">
                    v{r.version} · {r.editedBy} · <time dateTime={r.editedAt}>{fmtDateTime(r.editedAt)}</time>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-[--cp-text]">{r.body}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
