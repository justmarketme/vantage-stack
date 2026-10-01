"use client";

import { memo } from "react";
import { Check, X } from "lucide-react";
import type { CoachCard } from "../../../lib/consultant/types";
import { Button } from "../ui";
import { cx } from "../utils";
import { AskLine, HeardLine, SeverityTag, TheoryToggle } from "./cardParts";

type ActiveCard = CoachCard & { heard: string };

/**
 * Desktop card: all four NEPQ steps visible at once, ranked for a glance —
 * Ask (what to say next) is the largest; Listen is the quiet instruction above
 * it; Reframe and Confirm sit below. Theory hides behind the info icon.
 */
export const CoachCardView = memo(function CoachCardView({
  card,
  onUsed,
  onDismiss,
  compact = false,
}: {
  card: ActiveCard;
  onUsed: (id: string) => void;
  onDismiss: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <article
      aria-labelledby={`cc-${card.id}`}
      className={cx("flex h-full flex-col rounded-2xl bg-[--cp-surface]", `cp-edge-${card.severity}`)}
    >
      <div className="cp-scroll-y min-h-0 flex-1 space-y-4 p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1.5">
            <SeverityTag card={card} />
            <h3 id={`cc-${card.id}`} className="font-heading text-lg font-medium leading-snug text-[--cp-text]">
              {card.title}
            </h3>
            <HeardLine heard={card.heard} />
          </div>
          <TheoryToggle theory={card.theory} className="-mr-2 -mt-2 shrink-0 text-right" />
        </div>

        <Step label="Listen">
          <p className="text-sm leading-relaxed text-[--cp-muted]">{card.listen}</p>
        </Step>

        <Step label="Ask" tone="coach">
          <div className="space-y-3">
            {(compact ? card.ask.slice(0, 1) : card.ask).map((line, i) => (
              <AskLine key={i} line={line} big={i === 0 && !compact} />
            ))}
          </div>
        </Step>

        <Step label="Reframe">
          <p className="text-sm leading-relaxed text-[--cp-text]">{card.reframe}</p>
        </Step>

        <Step label="Confirm" tone="progress">
          <p className="text-sm leading-relaxed text-[--cp-text]">{card.confirm}</p>
        </Step>
      </div>

      <div className="flex gap-2 border-t border-[--cp-border] p-3">
        <Button variant="ghost" className="flex-1" onClick={() => onDismiss(card.id)}>
          <X size={18} aria-hidden /> Dismiss
        </Button>
        <Button variant="progress" className="flex-1" onClick={() => onUsed(card.id)}>
          <Check size={18} aria-hidden /> Used it
        </Button>
      </div>
    </article>
  );
});

function Step({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "coach" | "progress";
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4
        className={cx(
          "mb-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
          tone === "coach" ? "text-[--cp-coach]" : tone === "progress" ? "text-[--cp-progress]" : "text-[--cp-muted]",
        )}
      >
        {label}
      </h4>
      {children}
    </section>
  );
}
