"use client";

import { useEffect, useId, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../../../lib/consultant/client/api";
import { useNoteDraft } from "../../../hooks/consultant/useNoteDraft";
import { useOnline } from "../../../hooks/consultant/useOnline";
import { useOutbox } from "../../../hooks/consultant/useOutbox";
import { invalidateQueries, useQuery } from "../../../hooks/consultant/useQuery";
import {
  CALL_DISPOSITIONS,
  SALES_STAGES,
  SALES_STAGE_LABELS,
  type CallDetail,
  type CallDisposition,
  type CallPatch,
  type Lead,
  type SalesStage,
} from "../../../lib/consultant/types";
import { INPUT_CLASS } from "../MicField";
import { NoteEditor } from "../notes/NoteEditor";
import { Sheet } from "../Sheet";
import { Button, Skeleton } from "../ui";
import { cx, describeError, DISPOSITION_LABELS, fmtClock, FOCUS, fromLocalInput } from "../utils";

/** Draft key shared with the in-call "Note" button, so a mid-call note carries into wrap-up. */
export function callNoteKey(callId: string): string {
  return `call:${callId}`;
}

/**
 * After hang-up: outcome, stage, next step, quick note — and Coach Alex's
 * summary filling in as soon as it's ready. Saving is one tap; everything that
 * can be queued offline (note, stage, next action) is.
 */
export function WrapUpSheet({
  open,
  callId,
  lead,
  durationSec,
  onDone,
  onClose,
}: {
  open: boolean;
  callId: string;
  lead: Lead | undefined;
  durationSec: number;
  onDone: (next: "today" | "review") => void;
  /** Close without saving (the draft note stays on the device). */
  onClose?: () => void;
}) {
  const online = useOnline();
  const { enqueue } = useOutbox();
  const note = useNoteDraft(callNoteKey(callId));
  const ids = useId();

  const [disposition, setDisposition] = useState<CallDisposition | null>(null);
  const [stage, setStage] = useState<SalesStage | null>(null);
  const [nextAction, setNextAction] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Summary polling while the sheet is open and Coach Alex is still writing.
  const [pollMs, setPollMs] = useState(3000);
  const detail = useQuery<CallDetail>(open ? `call:${callId}` : null, () => api.calls.get(callId), { refreshMs: pollMs });
  const call = detail.data?.call;
  const summary = call?.summary ?? null;
  const writing = !call || call.summaryStatus === "pending" || call.summaryStatus === "processing";
  useEffect(() => setPollMs(writing ? 3000 : 0), [writing]);

  const currentStage = stage ?? lead?.salesStage ?? "contacted";

  const save = async (next: "today" | "review") => {
    setSaving(true);
    setError(null);
    const patch: CallPatch = {};
    if (disposition) patch.disposition = disposition;
    if (stage && stage !== lead?.salesStage) patch.salesStage = stage;
    if (nextAction.trim()) patch.nextAction = nextAction.trim();
    const at = fromLocalInput(nextAt);
    if (at) patch.nextActionAt = at;

    // The note always goes through the outbox (offline-safe, idempotent).
    const body = note.draft.trim();
    if (body && lead) {
      enqueue({ kind: "note.create", input: { leadId: lead.id, callId, body } });
      note.clear();
    }

    try {
      if (Object.keys(patch).length > 0) {
        if (online) {
          await api.calls.patch(callId, patch);
        } else if (lead) {
          // Disposition needs the server; stage + next action can wait in the outbox.
          const leadPatch = {
            ...(patch.salesStage ? { salesStage: patch.salesStage } : {}),
            ...(patch.nextAction ? { nextAction: patch.nextAction } : {}),
            ...(patch.nextActionAt ? { nextActionAt: patch.nextActionAt } : {}),
          };
          if (Object.keys(leadPatch).length) enqueue({ kind: "lead.patch", leadId: lead.id, patch: leadPatch });
        }
      }
      void invalidateQueries("leads:");
      void invalidateQueries("lead:");
      void invalidateQueries("stats:");
      onDone(next);
    } catch (e) {
      setError(describeError(e, "save"));
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Wrap up"
      wide
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {!online && disposition && (
            <p className="text-xs text-[--cp-objection]">Offline: the note, stage and next step are saved on this device. Log the outcome again once you're back online.</p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[--cp-risk]">
              {error}
            </p>
          )}
          <div className="grid grid-cols-[1fr_2fr] gap-2">
            <Button variant="secondary" size="lg" disabled={saving} onClick={() => void save("review")}>
              Save &amp; review
            </Button>
            <Button variant="primary" size="lg" disabled={saving} onClick={() => void save("today")}>
              {saving ? "Saving…" : "Save & next call"}
            </Button>
          </div>
        </div>
      }
    >
      <p className="mb-4 text-sm text-[--cp-muted]">
        {lead?.clinicName ?? "Call"} · {fmtClock(durationSec)}
      </p>

      <fieldset className="mb-5">
        <legend className="mb-2 text-sm font-medium text-[--cp-text]">Outcome</legend>
        <div role="radiogroup" aria-label="Outcome" className="flex flex-wrap gap-2">
          {CALL_DISPOSITIONS.map((d) => {
            const selected = disposition === d;
            const suggested = summary?.recommendedDisposition === d;
            return (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDisposition(selected ? null : d)}
                className={cx(
                  "min-h-11 rounded-full border px-4 text-sm",
                  FOCUS,
                  selected
                    ? "border-[--cp-accent] bg-[--cp-accent-soft] text-[--cp-text]"
                    : "border-[--cp-border] bg-[--cp-surface] text-[--cp-muted] hover:text-[--cp-text]",
                )}
              >
                {DISPOSITION_LABELS[d]}
                {suggested && <span className="ml-1.5 text-[--cp-coach]">· suggested</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-stage`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            Stage
          </label>
          <select
            id={`${ids}-stage`}
            value={currentStage}
            onChange={(e) => setStage(e.target.value as SalesStage)}
            className={cx(INPUT_CLASS, "border-[--cp-border]")}
          >
            {SALES_STAGES.map((s) => (
              <option key={s} value={s}>
                {SALES_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          {summary?.recommendedStage && summary.recommendedStage !== currentStage && (
            <button
              type="button"
              onClick={() => setStage(summary.recommendedStage)}
              className={cx("mt-1 min-h-11 text-left text-sm text-[--cp-coach] underline-offset-2 hover:underline", FOCUS)}
            >
              Coach Alex suggests: {SALES_STAGE_LABELS[summary.recommendedStage]}
            </button>
          )}
        </div>
        <div>
          <label htmlFor={`${ids}-when`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            Next step — when
          </label>
          <input
            id={`${ids}-when`}
            type="datetime-local"
            value={nextAt}
            onChange={(e) => setNextAt(e.target.value)}
            className={cx(INPUT_CLASS, "border-[--cp-border] [color-scheme:dark]")}
          />
        </div>
      </div>
      <div className="mb-5">
        <label htmlFor={`${ids}-next`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
          Next step — what
        </label>
        <input
          id={`${ids}-next`}
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder={summary?.nextSteps[0] ?? "Send demo invite"}
          className={cx(INPUT_CLASS, "border-[--cp-border]")}
        />
      </div>

      <div className="mb-5">
        <p className="mb-1.5 text-sm font-medium text-[--cp-text]">Quick note</p>
        <NoteEditor
          value={note.draft}
          onChange={note.setDraft}
          label="Quick note"
          rows={3}
          placeholder="Anything Coach Alex won't catch…"
          status={note.draft && note.savedAt ? "Saved on this device" : null}
        />
      </div>

      <section aria-live="polite" aria-busy={writing} className="cp-edge-guide rounded-2xl bg-[--cp-surface] p-4">
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[--cp-coach]">
          <Sparkles size={15} aria-hidden /> Coach Alex summary
        </h3>
        {call?.summaryStatus === "ready" && summary ? (
          <div className="space-y-2 text-sm text-[--cp-text]">
            <p>{summary.summary}</p>
            {summary.keyPoints.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-[--cp-muted]">
                {summary.keyPoints.slice(0, 4).map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            )}
          </div>
        ) : call?.summaryStatus === "failed" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-[--cp-muted]">Coach Alex couldn't write this one.</p>
            <Button
              variant="secondary"
              onClick={() => {
                void api.calls.summarise(callId).then(() => {
                  setPollMs(3000);
                  void detail.refresh();
                }, () => undefined);
              }}
            >
              Try again
            </Button>
          </div>
        ) : call?.summaryStatus === "skipped" ? (
          <p className="text-sm text-[--cp-muted]">No summary — the call was too short.</p>
        ) : (
          <div>
            <p className="mb-2 text-sm text-[--cp-muted]">Coach Alex is writing your summary…</p>
            <Skeleton className="mb-1.5 h-3.5 w-full" />
            <Skeleton className="mb-1.5 h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        )}
      </section>
    </Sheet>
  );
}
