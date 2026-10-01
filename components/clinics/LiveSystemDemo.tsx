"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The "it is running" section.
 *
 * A scripted console, not a fake dashboard. The distinction matters: a
 * dashboard of invented KPIs asks to be believed, while a transcript of a
 * single enquiry being handled can be READ and checked for plausibility. The
 * second is far more persuasive to someone who runs a front desk, because they
 * know what a real one sounds like.
 *
 * Constraints enforced here:
 *  · No clinical language. The assistant books, confirms, and hands over. It
 *    never assesses, advises, triages by severity, or implies a diagnosis.
 *  · The handover to a human is shown explicitly, because that is the product
 *    truth and the thing a sceptical clinic owner is looking for.
 */

type Turn = {
  at: string;
  who: "patient" | "system" | "reception";
  text: string;
  /** Rendered as a system annotation rather than dialogue. */
  note?: string;
};

const SCRIPT: Turn[] = [
  { at: "19:42", who: "patient", text: "Hi — do you have anything this week? I chipped a front tooth." },
  {
    at: "19:42",
    who: "system",
    text: "Hi Thabo — yes. I can see Thursday 10:20 or Friday 08:40 with Dr Naidoo. Which suits you?",
    note: "Answered in 14s · after hours · live availability read",
  },
  { at: "19:43", who: "patient", text: "Thursday please." },
  {
    at: "19:43",
    who: "system",
    text: "Booked — Thursday 10:20 with Dr Naidoo. I have sent it to your WhatsApp. Anything you would like reception to know before you come in?",
    note: "Slot held in the practice diary",
  },
  {
    at: "19:44",
    who: "patient",
    text: "Is that going to need a crown? And will my medical aid cover it?",
  },
  {
    at: "19:44",
    who: "system",
    text: "That is one for Dr Naidoo to look at on the day — I am not able to say what treatment you will need. On the medical aid side I have asked reception to confirm your cover and come back to you in the morning.",
    note: "Clinical question → declined and routed. Cover query → queued for a human.",
  },
  {
    at: "08:05",
    who: "reception",
    text: "Morning Thabo — Lerato here at the practice. I have checked your plan and the consult is covered; I will confirm the rest once Dr Naidoo has seen it. See you Thursday.",
    note: "Reception picked up the queued item with the full thread already in front of her",
  },
  {
    at: "Wed 10:20",
    who: "system",
    text: "Reminder: Thursday 10:20 with Dr Naidoo. Reply C to confirm or R to move it.",
    note: "24h confirmation · this is the step that protects the chair",
  },
  { at: "Wed 10:26", who: "patient", text: "C" },
  {
    at: "Wed 10:26",
    who: "system",
    text: "Confirmed. See you Thursday.",
    note: "Chair secured · recall scheduled for 6 months",
  },
];

const WHO_LABEL: Record<Turn["who"], string> = {
  patient: "Patient",
  system: "Vantage Stack",
  reception: "Reception · Lerato",
};

/** Delay before each successive turn appears. */
const TURN_MS = 1700;

export function LiveSystemDemo() {
  const reduce = useReducedMotion();
  // Starts at 1, not 0: the opening message is always on screen, so the card
  // never renders as an empty box while waiting for the first tick.
  const [shown, setShown] = useState(reduce ? SCRIPT.length : 1);
  const [running, setRunning] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setRunning(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);

    // Same safety net as the problem section: if the observer never reports,
    // the transcript would sit empty behind its chrome and read as broken.
    const failsafe = window.setTimeout(() => setRunning(true), 1200);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  useEffect(() => {
    if (reduce || !running) return;
    if (shown >= SCRIPT.length) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), TURN_MS);
    return () => window.clearTimeout(id);
  }, [shown, running, reduce]);

  // Keep the newest turn in view WITHOUT moving the page: scrolling the inner
  // pane only. Calling scrollIntoView here would yank the whole document.
  useEffect(() => {
    const pane = scrollRef.current;
    if (!pane || reduce) return;
    pane.scrollTop = pane.scrollHeight;
  }, [shown, reduce]);

  const done = shown >= SCRIPT.length;

  return (
    <div ref={hostRef} className="vs-card !p-0 overflow-hidden">
      {/* Console chrome */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            {!reduce && !done && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <p className="text-sm font-medium">Live enquiry</p>
          <span className="vs-badge !px-2 !py-0.5 !text-[10px]">Thursday, after hours</span>
        </div>

        <button
          type="button"
          onClick={() => setShown(0)}
          className="text-xs text-textMuted transition-colors hover:text-textPrimary"
        >
          Replay
        </button>
      </div>

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="max-h-[460px] space-y-3 overflow-y-auto px-5 py-5"
        aria-live="polite"
      >
        {SCRIPT.slice(0, shown).map((turn, i) => {
          const mine = turn.who === "patient";
          return (
            <div
              key={i}
              className={`flex flex-col ${mine ? "items-start" : "items-end"}`}
              style={
                reduce
                  ? undefined
                  : { animation: "vsFadeUp 380ms ease-out both" }
              }
            >
              <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-textMuted/70">
                <span>{WHO_LABEL[turn.who]}</span>
                <span className="tabular-nums">{turn.at}</span>
              </div>

              <div
                className={[
                  "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                  mine
                    ? "border border-white/10 bg-white/[0.03] text-textPrimary/90"
                    : turn.who === "reception"
                      ? "border border-white/15 bg-white/[0.06] text-textPrimary"
                      : "border border-accent/30 bg-accent/[0.08] text-textPrimary",
                ].join(" ")}
              >
                {turn.text}
              </div>

              {turn.note && (
                <p className="mt-1.5 max-w-[85%] text-[11px] leading-relaxed text-textMuted">
                  {turn.note}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/10 px-5 py-3">
        <p className="text-xs leading-relaxed text-textMuted">
          Illustrative transcript. The assistant books, confirms and hands over — it does not
          assess symptoms, advise on treatment, or replace a clinical opinion.
        </p>
      </div>

      <style jsx global>{`
        @keyframes vsFadeUp {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
