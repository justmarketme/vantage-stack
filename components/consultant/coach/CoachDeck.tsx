"use client";

import { memo, useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { Check, X } from "lucide-react";
import type { CoachCard } from "../../../lib/consultant/types";
import { Button } from "../ui";
import { cx, FOCUS } from "../utils";
import { AskLine, HeardLine, SeverityTag, STEP_LABEL, STEPS, TheoryToggle, type Step } from "./cardParts";

type ActiveCard = CoachCard & { heard: string };

const SWIPE_PX = 56;
const SWIPE_VELOCITY = 400;

/**
 * Phone "Tactical Field View": one card, four large step tabs.
 * Swipe left/right (or tap a tab, or ←/→) moves Listen → Ask → Reframe → Confirm.
 * Used / Dismiss are explicit buttons — swipe is reserved for step navigation.
 * The step resets to Listen whenever a new card arrives.
 */
export const CoachDeck = memo(function CoachDeck({
  card,
  onUsed,
  onDismiss,
}: {
  card: ActiveCard;
  onUsed: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const baseId = useId();
  const [step, setStep] = useState<Step>("listen");
  const [dir, setDir] = useState(1);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    setStep("listen");
    setDir(1);
  }, [card.id]);

  const idx = STEPS.indexOf(step);

  const go = useCallback(
    (next: number, focus = false) => {
      const i = Math.max(0, Math.min(STEPS.length - 1, next));
      if (i === idx) return;
      setDir(i > idx ? 1 : -1);
      setStep(STEPS[i]);
      if (focus) tabRefs.current[i]?.focus();
    },
    [idx],
  );

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -SWIPE_PX || info.velocity.x < -SWIPE_VELOCITY) go(idx + 1);
    else if (info.offset.x > SWIPE_PX || info.velocity.x > SWIPE_VELOCITY) go(idx - 1);
  };

  const onTabKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); go(idx + 1, true); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); go(idx - 1, true); }
    else if (e.key === "Home") { e.preventDefault(); go(0, true); }
    else if (e.key === "End") { e.preventDefault(); go(STEPS.length - 1, true); }
  };

  return (
    <article aria-labelledby={`${baseId}-title`} className={cx("flex h-full min-h-0 flex-col rounded-3xl bg-[--cp-surface]", `cp-edge-${card.severity}`)}>
      <header className="flex items-start gap-2 px-5 pt-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <SeverityTag card={card} />
          <h3 id={`${baseId}-title`} className="font-heading text-xl font-medium leading-snug text-[--cp-text]">
            {card.title}
          </h3>
          <HeardLine heard={card.heard} />
        </div>
        <TheoryToggle theory={card.theory} className="-mr-2 shrink-0 text-right" />
      </header>

      <div role="tablist" aria-label="Coaching steps" className="mt-3 grid grid-cols-4 gap-1.5 px-3" onKeyDown={onTabKey}>
        {STEPS.map((s, i) => {
          const selected = s === step;
          return (
            <button
              key={s}
              ref={(el) => { tabRefs.current[i] = el; }}
              role="tab"
              id={`${baseId}-tab-${s}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => go(i)}
              className={cx(
                "min-h-12 rounded-xl text-sm font-medium transition-colors",
                FOCUS,
                selected
                  ? "bg-[--cp-coach-soft] text-[--cp-coach] shadow-[inset_0_-2px_0_var(--cp-coach)]"
                  : "bg-[--cp-surface-2] text-[--cp-muted]",
              )}
            >
              {STEP_LABEL[s]}
            </button>
          );
        })}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout" custom={dir}>
          <motion.div
            key={`${card.id}-${step}`}
            id={`${baseId}-panel`}
            role="tabpanel"
            aria-labelledby={`${baseId}-tab-${step}`}
            custom={dir}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 48 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -48 }}
            transition={{ duration: reduce ? 0.1 : 0.18, ease: "easeOut" }}
            drag={reduce ? false : "x"}
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={onDragEnd}
            className="cp-scroll-y absolute inset-0 touch-pan-y px-5 py-4"
          >
            <StepBody card={card} step={step} />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-center gap-1.5 pb-2" aria-hidden>
        {STEPS.map((s) => (
          <span key={s} className={cx("h-1.5 rounded-full transition-all", s === step ? "w-5 bg-[--cp-coach]" : "w-1.5 bg-[--cp-surface-3]")} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-[--cp-border] p-3">
        <Button variant="secondary" size="xl" onClick={() => onDismiss(card.id)}>
          <X size={20} aria-hidden /> Dismiss
        </Button>
        <Button variant="progress" size="xl" onClick={() => onUsed(card.id)}>
          <Check size={20} aria-hidden /> Used it
        </Button>
      </div>
    </article>
  );
});

function StepBody({ card, step }: { card: ActiveCard; step: Step }) {
  switch (step) {
    case "listen":
      return <p className="text-xl leading-relaxed text-[--cp-text]">{card.listen}</p>;
    case "ask":
      return (
        <div className="space-y-5">
          {card.ask.map((line, i) => (
            <AskLine key={i} line={line} big />
          ))}
        </div>
      );
    case "reframe":
      return <p className="text-xl leading-relaxed text-[--cp-text]">{card.reframe}</p>;
    case "confirm":
      return <p className="text-xl leading-relaxed text-[--cp-text]">{card.confirm}</p>;
  }
}
