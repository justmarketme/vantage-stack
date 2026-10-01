"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * The problem section's visual: the same journey as the hero, but rendered as
 * disconnected fragments with enquiries falling out of the gaps between them.
 *
 * Deliberately the SAME five stages as `CLINIC_STAGES`. The argument of the
 * page is that clinics already have all the parts — what they do not have is
 * the connections. Showing different stages here would let the reader conclude
 * they need different tools, which is precisely the wrong conclusion.
 *
 * No accent blue at all in this visual. The broken state is grey and inert;
 * blue arrives only once the system connects, later on the page. That is the
 * colour doing argumentative work rather than decoration.
 */

type Gap = {
  key: string;
  before: string;
  /** What falls through this particular crack. */
  loss: string;
  /** The line a clinic owner would actually say about it. */
  voice: string;
};

const GAPS: Gap[] = [
  {
    key: "unanswered",
    before: "Enquiry lands",
    loss: "Rings out at lunch",
    voice: "Reception was with a patient. It went to voicemail. They booked down the road.",
  },
  {
    key: "slow",
    before: "Answered",
    loss: "Called back tomorrow",
    voice: "We got back to them the next morning. They had already been seen.",
  },
  {
    key: "manual",
    before: "Booked",
    loss: "Written in a book",
    voice: "It is in the diary, but nobody knows if they are actually coming.",
  },
  {
    key: "noshow",
    before: "Confirmed",
    loss: "Empty chair at 14:00",
    voice: "That is an hour of a practitioner's day we cannot sell twice.",
  },
  {
    key: "norecall",
    before: "Returned",
    loss: "Never came back",
    voice: "They were due six months ago. Nobody phoned. They are just gone.",
  },
];

export function BrokenJourney() {
  const reduce = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        // One-way: once it has been seen, it stays revealed. Re-animating on
        // every scroll-by turns a point into a gimmick.
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);

    // SAFETY NET. These cards render at opacity 0 and are revealed by the
    // observer, so anything that stops it firing — a backgrounded tab, a very
    // short viewport, heavy zoom, an environment that throttles observers —
    // leaves the entire problem section blank. Content that depends on JS to
    // become visible must have a way back. After 1.2s we reveal regardless.
    const failsafe = window.setTimeout(() => setVisible(true), 1200);

    return () => {
      io.disconnect();
      window.clearTimeout(failsafe);
    };
  }, []);

  const shown = reduce || visible;

  return (
    <div ref={ref} className="grid grid-cols-1 gap-4 md:grid-cols-5 md:gap-3">
      {GAPS.map((gap, i) => (
        <div
          key={gap.key}
          className="relative"
          style={{
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0)" : "translateY(12px)",
            transition: reduce ? undefined : `opacity 500ms ease-out ${i * 90}ms, transform 500ms ease-out ${i * 90}ms`,
          }}
        >
          {/* The severed connector — a dashed stub that stops short, on both
              sides, so the eye reads a missing link rather than an end. */}
          {i < GAPS.length - 1 && (
            <span
              aria-hidden
              className="absolute -right-1.5 top-[34px] hidden h-px w-3 border-t border-dashed border-white/20 md:block"
            />
          )}

          <div className="h-full rounded-2xl border border-white/10 bg-white/[0.015] px-4 py-5">
            <p className="text-[11px] uppercase tracking-[0.16em] text-textMuted/70">{gap.before}</p>

            <p className="mt-3 flex items-center gap-2 text-sm font-medium text-textPrimary/80">
              <span
                aria-hidden
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-textMuted/50"
              />
              {gap.loss}
            </p>

            <p className="mt-3 border-l border-white/10 pl-3 text-xs italic leading-relaxed text-textMuted">
              &ldquo;{gap.voice}&rdquo;
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
