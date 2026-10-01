"use client";

import { memo } from "react";
import { COACH_CARDS } from "../../../lib/consultant/coach/cards";
import { NEPQ_STAGES, type NepqStage } from "../../../lib/consultant/types";
import { cx, NEPQ_LABELS } from "../utils";
import { AskLine } from "./cardParts";

const STAGE_CARD = new Map(COACH_CARDS.filter((c) => c.kind === "stage").map((c) => [c.stage, c]));

/**
 * No card active → where the conversation is (NEPQ stage) and the go-to
 * question for it. The one thing to say next, nothing else.
 */
export const StageTracker = memo(function StageTracker({ stage, big = false }: { stage: NepqStage; big?: boolean }) {
  const current = NEPQ_STAGES.indexOf(stage);
  const card = STAGE_CARD.get(stage);
  return (
    <section aria-label="Conversation stage" className="flex h-full min-h-0 flex-col gap-4">
      <ol className="grid grid-cols-8 gap-1" aria-label={`Stage ${current + 1} of ${NEPQ_STAGES.length}: ${NEPQ_LABELS[stage]}`}>
        {NEPQ_STAGES.map((s, i) => (
          <li key={s} className="min-w-0">
            <span
              aria-hidden
              className={cx(
                "block h-1.5 rounded-full",
                i < current ? "bg-[--cp-coach-glow]" : i === current ? "bg-[--cp-coach]" : "bg-[--cp-surface-3]",
              )}
            />
            <span className="sr-only">
              {NEPQ_LABELS[s]}
              {i < current ? " (done)" : i === current ? " (now)" : ""}
            </span>
          </li>
        ))}
      </ol>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[--cp-coach]">
          Now · {NEPQ_LABELS[stage]}
        </p>
        {card && <p className="mt-0.5 font-heading text-base text-[--cp-text]">{card.title}</p>}
      </div>
      {card && (
        <div className="cp-scroll-y min-h-0 flex-1 space-y-3">
          <p className="text-sm text-[--cp-muted]">{card.listen}</p>
          {card.ask.map((line, i) => (
            <AskLine key={i} line={line} big={big && i === 0} />
          ))}
        </div>
      )}
    </section>
  );
});
