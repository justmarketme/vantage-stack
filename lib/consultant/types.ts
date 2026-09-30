import { z } from "zod";

/**
 * The single contract between the Consultant Portal front end and its API.
 *
 * Every request body is parsed with these schemas on the server, and the same
 * schemas drive client-side validation. Changing anything here is a
 * coordinator decision — see docs/consultant-portal/SPEC.md.
 */

// ── Vocabularies ────────────────────────────────────────────────────────────

/** The CRM vertical every Consultant Portal record is tagged with. */
export const CLINICS_VERTICAL = "clinics" as const;

/** The consultant's own sales pipeline. Separate from the CRM's delivery `status`. */
export const SALES_STAGES = [
  "new",
  "contacted",
  "discovery_booked",
  "demo_done",
  "proposal",
  "won",
  "lost",
] as const;
export type SalesStage = (typeof SALES_STAGES)[number];

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  new: "New",
  contacted: "Contacted",
  discovery_booked: "Discovery booked",
  demo_done: "Demo done",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

export const CALL_DISPOSITIONS = [
  "no_answer",
  "voicemail",
  "gatekeeper",
  "callback",
  "not_interested",
  "discovery_booked",
  "demo_booked",
  "wrong_number",
] as const;
export type CallDisposition = (typeof CALL_DISPOSITIONS)[number];

/** Lifecycle of a call row. Mirrors Twilio call statuses, collapsed. */
export const CALL_STATUSES = ["initiated", "ringing", "in_progress", "completed", "failed"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

/** Post-call processing: transcript assembled → summarised by Coach Alex. */
export const SUMMARY_STATUSES = ["pending", "processing", "ready", "failed", "skipped"] as const;
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number];

/** Who is speaking in a transcript segment. */
export const SPEAKERS = ["consultant", "prospect"] as const;
export type Speaker = (typeof SPEAKERS)[number];

/** NEPQ (Jeremy Miner) conversation stages, in order. */
export const NEPQ_STAGES = [
  "connection",
  "situation",
  "problem_awareness",
  "solution_awareness",
  "consequence",
  "qualifying",
  "transition",
  "commitment",
] as const;
export type NepqStage = (typeof NEPQ_STAGES)[number];

export const NOTE_KINDS = ["manual", "ai_summary"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

/** Deal health shown as Red / Yellow / Green on the pipeline. */
export const DEAL_HEALTH = ["red", "yellow", "green"] as const;
export type DealHealth = (typeof DEAL_HEALTH)[number];

// ── Normalisers shared by client and server ─────────────────────────────────

/** E.164 after normalisation; ZA local numbers (0XXXXXXXXX) are converted to +27. */
export function normalizeE164(input: string): string | null {
  let s = input.trim().replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{9}$/.test(s)) s = "+27" + s.slice(1);
  if (!s.startsWith("+") && /^\d{10,15}$/.test(s)) s = "+" + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

const phone = z
  .string()
  .trim()
  .max(32)
  .transform((v, ctx) => {
    const n = normalizeE164(v);
    if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number" });
    return n ?? v;
  });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const url = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.string().url("Enter a valid website"));

// ── Inputs ──────────────────────────────────────────────────────────────────

export const LeadInput = z.object({
  clinicName: z.string().trim().min(1, "Clinic name is required").max(120),
  contactName: optionalText(80),
  contactRole: optionalText(80),
  phone,
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(160).optional().or(z.literal("").transform(() => undefined)),
  website: url.optional().or(z.literal("").transform(() => undefined)),
  city: optionalText(80),
  source: optionalText(80),
  nextAction: optionalText(200),
  nextActionAt: z.string().datetime({ offset: true }).optional(),
});
export type LeadInput = z.infer<typeof LeadInput>;

export const LeadPatch = z
  .object({
    clinicName: z.string().trim().min(1).max(120),
    contactName: z.string().trim().max(80).nullable(),
    contactRole: z.string().trim().max(80).nullable(),
    phone,
    email: z.string().trim().toLowerCase().email().max(160).nullable(),
    website: url.nullable(),
    city: z.string().trim().max(80).nullable(),
    salesStage: z.enum(SALES_STAGES),
    lostReason: z.string().trim().max(200).nullable(),
    nextAction: z.string().trim().max(200).nullable(),
    nextActionAt: z.string().datetime({ offset: true }).nullable(),
    /** Monthly deal value in ZAR, set at proposal / won. */
    dealValue: z.number().int().min(0).max(10_000_000).nullable(),
    /** Managers only: reassign. Consultants use POST leads/[id]/claim. */
    consultantId: z.string().uuid().nullable(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");
export type LeadPatch = z.infer<typeof LeadPatch>;

export const StartCallInput = z.object({ leadId: z.string().uuid() });
export type StartCallInput = z.infer<typeof StartCallInput>;

export const CallPatch = z
  .object({
    disposition: z.enum(CALL_DISPOSITIONS),
    nextAction: z.string().trim().max(200).nullable(),
    nextActionAt: z.string().datetime({ offset: true }).nullable(),
    /** Convenience: moves the lead's stage in the same request as the wrap-up. */
    salesStage: z.enum(SALES_STAGES),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");
export type CallPatch = z.infer<typeof CallPatch>;

export const NoteInput = z.object({
  leadId: z.string().uuid(),
  callId: z.string().uuid().optional(),
  body: z.string().trim().min(1, "Note is empty").max(20_000),
  /** Client-generated id so an offline-queued create is idempotent on replay. */
  clientId: z.string().uuid().optional(),
});
export type NoteInput = z.infer<typeof NoteInput>;

export const NotePatch = z.object({
  body: z.string().trim().min(1).max(20_000),
  /** Optimistic concurrency: the version the editor started from. 409 if stale. */
  baseVersion: z.number().int().min(1),
});
export type NotePatch = z.infer<typeof NotePatch>;

export const CardEventInput = z.object({
  events: z
    .array(
      z.object({
        cardId: z.string().min(1).max(80),
        action: z.enum(["shown", "used", "dismissed"]),
        at: z.string().datetime({ offset: true }),
        triggerText: z.string().max(500).optional(),
      }),
    )
    .min(1)
    .max(100),
});
export type CardEventInput = z.infer<typeof CardEventInput>;

// ── Responses ───────────────────────────────────────────────────────────────

export type ApiError = { error: string; fields?: Record<string, string> };

export type Me = {
  memberId: string | null; // null for the legacy admin session (read-only manager)
  username: string;
  displayName: string;
  role: string;
  isManager: boolean;
  canCall: boolean;
};

export type Lead = {
  id: string; // = public.clients.id
  clinicName: string;
  contactName: string | null;
  contactRole: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  city: string | null;
  source: string | null;
  vertical: typeof CLINICS_VERTICAL;
  salesStage: SalesStage;
  salesStageChangedAt: string;
  lostReason: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  dealValue: number | null;
  consultantId: string | null;
  consultantName: string | null;
  health: DealHealth;
  lastCallAt: string | null;
  callCount: number;
  createdAt: string;
};

export type TranscriptSegment = {
  seq: number;
  speaker: Speaker;
  text: string;
  at: string;
};

export type CallSummary = {
  summary: string;
  keyPoints: string[];
  objections: { objection: string; handled: boolean; quote: string | null; betterResponse: string | null }[];
  nepqStages: { stage: NepqStage; reached: boolean; note: string | null }[];
  nextSteps: string[];
  recommendedStage: SalesStage | null;
  recommendedDisposition: CallDisposition | null;
  sentiment: "positive" | "neutral" | "negative";
  coachingTips: string[];
  extracted: {
    email: string | null;
    website: string | null;
    decisionMaker: string | null;
    painPoints: string[];
  };
};

export type Call = {
  id: string;
  leadId: string;
  consultantId: string;
  consultantName: string | null;
  toNumber: string;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  hasRecording: boolean;
  disposition: CallDisposition | null;
  nextAction: string | null;
  nextActionAt: string | null;
  summaryStatus: SummaryStatus;
  summary: CallSummary | null;
};

export type Note = {
  id: string;
  leadId: string;
  callId: string | null;
  kind: NoteKind;
  body: string;
  version: number;
  createdBy: string; // display name, or "Coach Alex" for ai_summary
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

export type NoteRevision = {
  version: number;
  body: string;
  editedBy: string;
  editedAt: string;
};

export type LeadDetail = { lead: Lead; calls: Call[]; notes: Note[] };

export type CallDetail = {
  call: Call;
  lead: Lead;
  transcript: TranscriptSegment[];
  notes: Note[];
};

export type LiveCallState = {
  status: CallStatus;
  segments: TranscriptSegment[]; // only seq > `after`
  lastSeq: number;
  ended: boolean;
  /** Server-configured poll interval, so the client never imports config. */
  pollMs: number;
};

export type VoiceToken = { token: string; identity: string; expiresAt: string };

export type TodayStats = {
  dials: number;
  connects: number; // answered calls
  talkTimeSec: number;
  discoveryBooked: number;
  demosBooked: number;
  dueFollowUps: number;
};

// ── Coach Alex live cards ───────────────────────────────────────────────────

/**
 * How urgent a card is. Drives the glowing edge colour on desktop and whether
 * the phone dims + flashes: high_risk = red (deal-threatening objection),
 * stall = yellow (delay tactic), guide = no alert (stage prompts).
 */
export const CARD_SEVERITIES = ["high_risk", "stall", "guide"] as const;
export type CardSeverity = (typeof CARD_SEVERITIES)[number];

export type CoachCard = {
  id: string;
  kind: "objection" | "stage";
  stage: NepqStage;
  severity: CardSeverity;
  title: string;
  /**
   * Lower-case phrases matched against what the PROSPECT says. Word-boundary
   * matched; the first-listed phrases are the strongest signals.
   */
  triggers: string[];
  /** NEPQ response framework: Listen → Ask → Reframe → Confirm. */
  listen: string;
  ask: string[];
  reframe: string;
  confirm: string;
  /**
   * The deeper NEPQ psychology behind this card, hidden behind an "expand"
   * icon (progressive disclosure) so the live view stays strictly actionable.
   */
  theory: string;
  /** Higher wins when two cards match the same utterance. 1–10. */
  priority: number;
};

export type CardMatch = { cardId: string; score: number; matched: string };
