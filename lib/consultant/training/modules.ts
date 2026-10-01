/**
 * Sales Readiness & Training — the six 8-second micro-clips every consultant
 * works through in order (docs/consultant-portal/SPEC-WAVE2.md → Training).
 *
 * These are static definitions (content only, no logic). The server
 * (`GET /api/consultant/training`) joins them with each consultant's progress
 * and enforces the sequential unlock; the UI only renders what it gets back.
 *
 * `videoPath` is a storage path / public path for the clip. It stays `null`
 * until Jono supplies the clips — the Training screen then shows a
 * "clip coming soon" placeholder instead of a broken player.
 */

export type TrainingModuleDef = {
  /** Stable key — stored against progress rows, so never rename one. */
  id: string;
  /** 1..6, the order they unlock in. */
  order: number;
  title: string;
  /** One or two plain-English sentences shown under the title. */
  summary: string;
  videoPath: string | null;
  /** Every clip is an 8-second micro-lesson. */
  durationSec: 8;
};

export const TRAINING_MODULES: readonly TrainingModuleDef[] = [
  {
    id: "vantagestack-method",
    order: 1,
    title: "The VantageStack method",
    summary:
      "Why aesthetic clinics lose revenue to missed calls, slow WhatsApp replies and no-shows — and exactly what our AI booking agent fixes.",
    videoPath: null,
    durationSec: 8,
  },
  {
    id: "why-board",
    order: 2,
    title: "Your Why Board",
    summary: "Set the goal that gets you dialling, add the reason it matters, and see what it takes per working day.",
    videoPath: null,
    durationSec: 8,
  },
  {
    id: "call-flow-nepq",
    order: 3,
    title: "The call flow & NEPQ stages",
    summary:
      "Connection to commitment in eight stages: calm, curious questions to the clinic, and a booked next step with a date on every call.",
    videoPath: null,
    durationSec: 8,
  },
  {
    id: "coach-alex-live",
    order: 4,
    title: "Coach Alex flashcards live",
    summary:
      "How cards fire when the clinic raises an objection: read the Ask, hold the Reframe, land the Confirm — and swipe to the next.",
    videoPath: null,
    durationSec: 8,
  },
  {
    id: "mobile-capture",
    order: 5,
    title: "Mobile capture",
    summary:
      "Dictate emails, websites and +27 numbers straight into the form, and keep taking notes offline — they sync when you're back.",
    videoPath: null,
    durationSec: 8,
  },
  {
    id: "demo-to-paid",
    order: 6,
    title: "From demo to paid",
    summary:
      "Wrap-up, booking discovery and demo meetings, payment confirmation, and how your commission is calculated on the amount paid.",
    videoPath: null,
    durationSec: 8,
  },
] as const;
