"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The hero product visual: one enquiry travelling the full length of the
 * system, with each stage lighting only when the pulse actually reaches it.
 *
 * The point is cause and effect — a stage does not glow because it is pretty,
 * it glows because something arrived. That is the whole argument of the page
 * rendered as a mechanism, which is why this is a driven animation rather than
 * five independently looping decorations.
 *
 * Accent is carried by the moving pulse and the single active stage. Everything
 * at rest stays near-monochrome, so blue reads as "this is happening now"
 * rather than as a background wash.
 */

export type JourneyStage = {
  key: string;
  label: string;
  /** What the system does here, in the clinic's own words. */
  detail: string;
  /** Elapsed-time caption — the reason the stage matters. */
  timing: string;
};

export const CLINIC_STAGES: JourneyStage[] = [
  {
    key: "enquiry",
    label: "Enquiry lands",
    detail: "Call, WhatsApp, form, or Maps — all into one queue",
    timing: "0s",
  },
  {
    key: "answered",
    label: "Answered",
    detail: "Replied to while they are still deciding",
    timing: "under 60s",
  },
  {
    key: "booked",
    label: "Booked",
    detail: "Slot held against live practitioner availability",
    timing: "same session",
  },
  {
    key: "confirmed",
    label: "Confirmed",
    detail: "Reminders go out until the chair is certain",
    timing: "48h before",
  },
  {
    key: "returned",
    label: "Returned",
    detail: "Recall runs itself when they are due back",
    timing: "months later",
  },
];

/** Milliseconds a pulse spends travelling between two stages. */
const STEP_MS = 1400;

export function RevenueJourney({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [revenue, setRevenue] = useState(0);
  const [running, setRunning] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  // Only animate while the visual is actually on screen. A hero that keeps
  // ticking after the reader has scrolled to the ROI section is burning battery
  // to animate something nobody is looking at.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setRunning(entry.isIntersecting),
      { threshold: 0.25 },
    );
    io.observe(el);

    // If the observer never reports, the journey would sit frozen on its first
    // stage forever — the one visual the hero exists to show, not moving.
    const failsafe = window.setTimeout(() => setRunning(true), 1200);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  useEffect(() => {
    if (reduce || !running) return;
    const id = window.setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % CLINIC_STAGES.length;
        // Revenue only books when the journey completes — wrapping past the
        // last stage. Incrementing on every step would imply a booking that
        // has not happened yet.
        if (next === 0) setRevenue((r) => r + 1);
        return next;
      });
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [reduce, running]);

  // With motion reduced, present the end state rather than a frozen first
  // frame: the reader still sees a completed journey, just not the travel.
  const stages = useMemo(
    () => CLINIC_STAGES.map((s, i) => ({ ...s, on: reduce ? true : i <= active })),
    [active, reduce],
  );

  return (
    <div
      ref={hostRef}
      className={`vs-card relative overflow-hidden !px-5 !py-6 md:!px-7 md:!py-7 ${className}`}
      // Decorative: the same information is in the section copy and the stage
      // list below, so a screen reader gains nothing from the animation frames.
      role="img"
      aria-label="A patient enquiry moving through the Vantage Stack system: it lands, is answered in under a minute, booked, confirmed, and later returns through automated recall."
    >
      {/* Ambient wash — kept extremely low so the accent stays with the pulse. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/4 h-64 w-64 rounded-full bg-accent/10 blur-3xl"
      />

      <div className="relative flex items-center justify-between gap-4">
        <div>
          <p className="vs-section-heading !mb-1">Live journey</p>
          <p className="font-heading text-lg md:text-xl">One enquiry, end to end</p>
        </div>
        <div className="text-right">
          <p className="font-heading text-2xl md:text-3xl tabular-nums text-accent">
            {revenue}
          </p>
          <p className="text-[11px] uppercase tracking-[0.16em] text-textMuted">
            booked this run
          </p>
        </div>
      </div>

      {/* Track. Vertical on mobile, horizontal from md up. */}
      <ol className="relative mt-7 flex flex-col gap-3 md:mt-9 md:flex-row md:gap-0">
        {stages.map((stage, i) => (
          <li key={stage.key} className="relative flex-1 md:pr-3 last:md:pr-0">
            {/* Connector to the NEXT stage. Hidden on the last item.
                Two separate rails rather than one responsive rail: the mobile
                track fills downward and the desktop track fills rightward, and
                a single element cannot carry both scale axes across a
                breakpoint without a class swap that Tailwind cannot express on
                an inline transform. */}
            {i < stages.length - 1 && (
              <>
                {/* Mobile — vertical */}
                <span
                  aria-hidden
                  className="absolute left-[11px] top-7 h-[calc(100%-4px)] w-px overflow-hidden bg-white/10 md:hidden"
                >
                  <span
                    className="absolute inset-0 origin-top bg-accent transition-transform duration-700 ease-out"
                    style={{ transform: `scaleY(${stages[i + 1].on ? 1 : 0})` }}
                  />
                </span>
                {/* Desktop — horizontal */}
                <span
                  aria-hidden
                  className="absolute left-[22px] top-[11px] hidden h-px w-[calc(100%-22px)] overflow-hidden bg-white/10 md:block"
                >
                  <span
                    className="absolute inset-0 origin-left bg-accent transition-transform duration-700 ease-out"
                    style={{ transform: `scaleX(${stages[i + 1].on ? 1 : 0})` }}
                  />
                </span>
              </>
            )}

            <div className="flex items-start gap-3 md:block">
              <span
                aria-hidden
                className={[
                  "relative mt-[2px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition-all duration-500",
                  stage.on
                    ? "border-accent bg-accent/15"
                    : "border-white/15 bg-white/[0.02]",
                ].join(" ")}
              >
                <span
                  className={[
                    "h-[7px] w-[7px] rounded-full transition-all duration-500",
                    stage.on ? "bg-accent" : "bg-white/20",
                  ].join(" ")}
                />
                {/* The pulse ring marks the CURRENT stage only. */}
                {!reduce && i === active && (
                  <span className="absolute inset-0 animate-ping rounded-full border border-accent/60" />
                )}
              </span>

              <div className="md:mt-3">
                <p
                  className={[
                    "text-sm font-medium transition-colors duration-500",
                    stage.on ? "text-textPrimary" : "text-textMuted",
                  ].join(" ")}
                >
                  {stage.label}
                </p>
                <p className="mt-0.5 text-[11px] uppercase tracking-[0.14em] text-accent/70">
                  {stage.timing}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-textMuted">{stage.detail}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
