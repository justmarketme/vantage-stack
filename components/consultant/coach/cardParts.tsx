"use client";

import { memo, useId, useState } from "react";
import { Info } from "lucide-react";
import type { CardSeverity, CoachCard } from "../../../lib/consultant/types";
import { cx, FOCUS, NEPQ_LABELS } from "../utils";

export const SEVERITY_LABEL: Record<CardSeverity, string> = {
  high_risk: "High risk",
  stall: "Stall",
  guide: "Guide",
};

export const SEVERITY_TEXT: Record<CardSeverity, string> = {
  high_risk: "text-[--cp-risk]",
  stall: "text-[--cp-objection]",
  guide: "text-[--cp-coach]",
};

export const SEVERITY_SOFT: Record<CardSeverity, string> = {
  high_risk: "bg-[--cp-risk-soft]",
  stall: "bg-[--cp-objection-soft]",
  guide: "bg-[--cp-coach-soft]",
};

export const STEPS = ["listen", "ask", "reframe", "confirm"] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = { listen: "Listen", ask: "Ask", reframe: "Reframe", confirm: "Confirm" };

/** "[curious] What happens…" → { cue: "curious", text: "What happens…" }. */
export function splitCue(line: string): { cue: string | null; text: string } {
  const m = /^\s*\[([^\]]{1,40})\]\s*(.*)$/.exec(line);
  return m ? { cue: m[1], text: m[2] } : { cue: null, text: line };
}

export function SeverityTag({ card }: { card: Pick<CoachCard, "severity" | "stage" | "kind"> }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium uppercase tracking-[0.12em]">
      <span className={cx("rounded-full px-2 py-0.5", SEVERITY_SOFT[card.severity], SEVERITY_TEXT[card.severity])}>
        {card.kind === "objection" ? `Objection · ${SEVERITY_LABEL[card.severity]}` : "Stage guide"}
      </span>
      <span className="text-[--cp-muted]">{NEPQ_LABELS[card.stage]}</span>
    </p>
  );
}

export function HeardLine({ heard, className }: { heard: string; className?: string }) {
  if (!heard) return null;
  return (
    <p className={cx("text-sm text-[--cp-muted]", className)}>
      Heard: <q className="italic text-[--cp-text]">{heard}</q>
    </p>
  );
}

/** One Ask line: tonality cue small, the words to say big. */
export const AskLine = memo(function AskLine({ line, big = false }: { line: string; big?: boolean }) {
  const { cue, text } = splitCue(line);
  return (
    <p className={cx("text-[--cp-text]", big ? "text-2xl leading-snug" : "text-lg leading-snug")}>
      {cue && <span className="mr-1.5 align-middle text-xs font-medium not-italic text-[--cp-coach]">[{cue}]</span>}
      {text}
    </p>
  );
});

/** The NEPQ theory, behind an icon. Progressive disclosure: never in the glance. */
export function TheoryToggle({ theory, className }: { theory: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl px-2 text-xs text-[--cp-muted] hover:text-[--cp-text]",
          FOCUS,
        )}
      >
        <Info size={18} aria-hidden />
        <span className={open ? undefined : "sr-only"}>Why this works</span>
      </button>
      {open && (
        <p id={id} className="mt-1 rounded-xl bg-[--cp-surface-2] p-3 text-sm leading-relaxed text-[--cp-muted]">
          {theory}
        </p>
      )}
    </div>
  );
}

export function QueueDots({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  const shown = Math.min(count, 5);
  return (
    <p className={cx("flex items-center gap-1.5 text-xs text-[--cp-muted]", className)}>
      <span className="flex gap-1" aria-hidden>
        {Array.from({ length: shown }, (_, i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-[--cp-coach]" />
        ))}
      </span>
      <span>{count === 1 ? "1 more card waiting" : `${count} more cards waiting`}</span>
    </p>
  );
}
