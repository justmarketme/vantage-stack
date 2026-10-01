"use client";

import { memo } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCoach } from "../VoiceCallProvider";
import { cx } from "../utils";
import { CoachAvatar } from "./CoachAvatar";
import { CoachCardView } from "./CoachCardView";
import { QueueDots, SEVERITY_LABEL } from "./cardParts";
import { StageTracker } from "./StageTracker";

/**
 * Desktop Coach Alex panel. Used docked in the live-call
 * page's right column and inside the floating widget on other pages.
 *
 * The card area is a RESERVED box (flex-1, fixed by its container): cards
 * slide in from the right inside it, so nothing around it ever shifts.
 */
export const CoachPanel = memo(function CoachPanel({
  compact = false,
  headerExtra,
}: {
  compact?: boolean;
  headerExtra?: React.ReactNode;
}) {
  const { active, queue, stage, markUsed, dismiss } = useCoach();
  const reduce = useReducedMotion();

  return (
    <section aria-label="Coach Alex" className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 px-1 pb-3">
        <CoachAvatar pulseKey={active?.id ?? null} severity={active?.severity ?? null} />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-sm font-medium text-[--cp-text]">Coach Alex</p>
          <p className="truncate text-xs text-[--cp-muted]">
            {active ? `${SEVERITY_LABEL[active.severity]} · live advice` : "Listening for objections"}
          </p>
        </div>
        {headerExtra}
      </header>

      {/* Announce new cards once, politely — not the whole card body. */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {active ? `Coach Alex: ${active.title}. ${active.ask[0] ?? ""}` : ""}
      </p>

      <div className="relative min-h-0 flex-1">
        <AnimatePresence initial={false} mode="popLayout">
          {active ? (
            <motion.div
              key={active.id}
              className="absolute inset-0"
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
              transition={{ duration: reduce ? 0.12 : 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <CoachCardView card={active} onUsed={markUsed} onDismiss={dismiss} compact={compact} />
            </motion.div>
          ) : (
            <motion.div
              key="tracker"
              className={cx("absolute inset-0 rounded-2xl bg-[--cp-surface] p-4", "cp-edge-guide")}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <StageTracker stage={stage} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-h-7 items-center pt-2">
        <QueueDots count={queue.length} />
      </div>
    </section>
  );
});
