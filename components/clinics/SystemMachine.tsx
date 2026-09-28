"use client";

import { useState } from "react";

/**
 * The components section — rendered as one machine rather than a feature grid.
 *
 * The distinction that matters: a feature grid is a list of things you buy; a
 * machine is a set of parts that only work because of what they are attached
 * to. Every part here declares what it RECEIVES and what it PASSES ON, and
 * selecting one highlights its neighbours. You cannot read this as five
 * products, which is the point.
 *
 * Reception appears as a part of the machine, not as something the machine
 * replaces. That is a positioning decision, and it is load-bearing: clinic
 * owners do not want to be told their front desk is redundant, and it is not
 * true.
 */

type Part = {
  key: string;
  name: string;
  /** Plain-language role. */
  role: string;
  receives: string;
  passes: string;
  detail: string;
};

const PARTS: Part[] = [
  {
    key: "intake",
    name: "Unified intake",
    role: "One queue for every channel",
    receives: "Calls, WhatsApp, web forms, Google Maps",
    passes: "A single timestamped enquiry",
    detail:
      "Phone, WhatsApp and the website stop being three separate inboxes with three separate blind spots. Everything arrives in one queue, stamped with when it came in, so nothing is discovered three days later.",
  },
  {
    key: "responder",
    name: "First response",
    role: "Answers while they are still deciding",
    receives: "A new enquiry from intake",
    passes: "A qualified, answered enquiry",
    detail:
      "Replies immediately with real availability, answers the routine questions, and hands anything unusual straight to reception with the context already gathered. It does not give clinical advice and does not attempt to.",
  },
  {
    key: "booking",
    name: "Live booking",
    role: "Holds the slot against real availability",
    receives: "An enquiry ready to book",
    passes: "A confirmed appointment",
    detail:
      "Reads live practitioner availability rather than a copy of it, so a slot offered is a slot that exists. Writes back into the diary your practice already runs on.",
  },
  {
    key: "reception",
    name: "Reception console",
    role: "Your team, with better instruments",
    receives: "Everything the system is doing",
    passes: "Human judgement where it counts",
    detail:
      "Reception sees every live conversation and can take over mid-sentence. The system handles volume and hours; your people handle the cases that need a person. Augmentation, not replacement — and the console is designed so taking over is one click, not a support ticket.",
  },
  {
    key: "recall",
    name: "Recall engine",
    role: "Brings people back when they are due",
    receives: "Completed appointments",
    passes: "A new enquiry, months later",
    detail:
      "Closes the loop back into intake: when a patient is due, the system starts the journey again. This is the part most practices have never had at all, and it is usually where the largest recoverable number sits.",
  },
];

export function SystemMachine() {
  const [active, setActive] = useState<string>(PARTS[0].key);
  const activeIndex = PARTS.findIndex((p) => p.key === active);
  const activePart = PARTS[activeIndex];

  return (
    <div>
      {/* The chain. Each part shows its couplings to the next. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5 md:gap-0">
        {PARTS.map((part, i) => {
          const isActive = part.key === active;
          const isNeighbour = Math.abs(i - activeIndex) === 1;
          return (
            <div key={part.key} className="relative md:pr-2 last:md:pr-0">
              {/* Coupling to the next part — solid, and lit when either end is
                  in play. A connection is only interesting when something is
                  travelling through it. */}
              {i < PARTS.length - 1 && (
                <span
                  aria-hidden
                  className={[
                    "absolute right-0 top-1/2 hidden h-px w-2 transition-colors duration-300 md:block",
                    isActive || i + 1 === activeIndex ? "bg-accent" : "bg-white/15",
                  ].join(" ")}
                />
              )}

              <button
                type="button"
                onClick={() => setActive(part.key)}
                aria-pressed={isActive}
                className={[
                  "h-full w-full rounded-2xl border px-4 py-5 text-left transition-all duration-300",
                  isActive
                    ? "border-accent/60 bg-accent/[0.07] shadow-[0_0_30px_rgba(59,130,246,0.15)]"
                    : isNeighbour
                      ? "border-white/20 bg-white/[0.03]"
                      : "border-white/10 bg-white/[0.015] hover:border-white/25",
                ].join(" ")}
              >
                <span
                  className={[
                    "text-[11px] uppercase tracking-[0.16em] transition-colors",
                    isActive ? "text-accent" : "text-textMuted/70",
                  ].join(" ")}
                >
                  Part {i + 1}
                </span>
                <p className="mt-2 font-heading text-base leading-snug">{part.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-textMuted">{part.role}</p>
              </button>
            </div>
          );
        })}
      </div>

      {/* Detail for the selected part, framed as couplings first. */}
      <div className="vs-card mt-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
          <div className="md:w-1/3">
            <p className="vs-section-heading !mb-2">In → out</p>
            <p className="text-sm text-textPrimary/90">
              <span className="text-textMuted">Receives </span>
              {activePart.receives}
            </p>
            <p className="mt-2 text-sm text-textPrimary/90">
              <span className="text-textMuted">Passes on </span>
              {activePart.passes}
            </p>
          </div>
          <div className="md:flex-1">
            <p className="font-heading text-lg">{activePart.name}</p>
            <p className="mt-2 text-sm leading-relaxed text-textMuted">{activePart.detail}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
