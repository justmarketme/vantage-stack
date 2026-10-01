"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCoach } from "../VoiceCallProvider";
import { cx } from "../utils";
import { CoachAvatar } from "./CoachAvatar";
import { CoachDeck } from "./CoachDeck";
import { QueueDots } from "./cardParts";
import { StageTracker } from "./StageTracker";

const VIBRATE: Record<string, number[] | number> = { high_risk: [70, 50, 70], stall: 40 };

/**
 * Phone Coach Alex ("Tactical Field View"). Lives in a RESERVED area between
 * the call bar and the transcript peek, so a card arriving never moves
 * anything else. high_risk / stall cards enter Focus Mode: the rest of the
 * screen dims (call bar + controls stay above the scrim, still reachable), the
 * card pops front and centre, and high_risk adds one soft red flash + vibration
 * in place of haptics. Guide cards and the stage tracker never dim anything.
 */
export function CoachFocus() {
  const { active, queue, stage, markUsed, dismiss } = useCoach();
  const reduce = useReducedMotion();
  const focus = !!active && active.severity !== "guide";
  const lastAlerted = useRef<string | null>(null);

  useEffect(() => {
    if (!active || active.severity === "guide" || lastAlerted.current === active.id) return;
    lastAlerted.current = active.id;
    try {
      navigator.vibrate?.(VIBRATE[active.severity]);
    } catch {
      /* unsupported */
    }
  }, [active]);

  return (
    <>
      {/* Scrim: covers the transcript peek and background, not the call bar or controls (z-50). */}
      <AnimatePresence>
        {focus && (
          <motion.div
            key="scrim"
            aria-hidden
            className="absolute inset-0 z-40 bg-[--cp-scrim]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
        )}
      </AnimatePresence>
      {active?.severity === "high_risk" && (
        <div
          key={`flash-${active.id}`}
          aria-hidden
          className="cp-flash pointer-events-none absolute inset-0 z-[41] bg-[--cp-risk-soft]"
        />
      )}

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {active ? `Coach Alex${active.severity === "high_risk" ? ", high risk" : active.severity === "stall" ? ", stall" : ""}: ${active.title}` : ""}
      </p>

      <div className={cx("relative flex h-full min-h-0 flex-col", focus && "z-[45]")}>
        <div className="flex items-center gap-2 pb-2">
          <CoachAvatar pulseKey={active?.id ?? null} severity={active?.severity ?? null} size={28} />
          <span className="text-sm font-medium text-[--cp-text]">Coach Alex</span>
          <QueueDots count={active ? queue.length : 0} className="ml-auto" />
        </div>
        <div className="relative min-h-0 flex-1">
          <AnimatePresence initial={false} mode="popLayout">
            {active ? (
              <motion.div
                key={active.id}
                className="absolute inset-0"
                initial={reduce ? { opacity: 0 } : focus ? { opacity: 0, scale: 0.94, y: 12 } : { opacity: 0, x: 32 }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                transition={{ duration: reduce ? 0.12 : 0.22, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <CoachDeck card={active} onUsed={markUsed} onDismiss={dismiss} />
              </motion.div>
            ) : (
              <motion.div
                key="tracker"
                className="cp-edge-guide absolute inset-0 rounded-3xl bg-[--cp-surface] p-5"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <StageTracker stage={stage} big />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
