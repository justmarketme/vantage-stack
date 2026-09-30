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
  "no_show",
  "demo_done",
  "proposal",
  "won",
  "paid",
  "lost",
] as const;
export type SalesStage = (typeof SALES_STAGES)[number];

export const SALES_STAGE_LABELS: Record<SalesStage, string> = {
  new: "New",
  contacted: "Contacted",
  discovery_booked: "Discovery booked",
  no_show: "No show",
  demo_done: "Demo done",
  proposal: "Proposal",
  won: "Won",
  paid: "Paid",
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

/** South African numbers only (decision: +27 everywhere). Local 0XX… is converted. */
const phone = z
  .string()
  .trim()
  .max(32)
  .transform((v, ctx) => {
    const n = normalizeZaPhone(v);
    if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a South African number (+27 or 0…)" });
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
    /**
     * The clinic agreed ON THIS CALL to receive WhatsApp/SMS follow-ups.
     * Required before Emma may message a scraped (public-domain) lead — POPIA s.69.
     */
    whatsappConsent: z.boolean(),
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
  /** Wave 2: permission keys (e.g. "confirm_payments", "manage_gamification") for UI gating. */
  permissions: string[];
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
  /** Wave 2: explainable win/churn/CLV score. Absent on list endpoints that skip scoring. */
  score?: DealScore;
  /** Wave 2: the lead's Clinics deal, if any. */
  deal?: Deal | null;
  /**
   * Electronic-messaging consent. Scraped public-domain leads start at "none":
   * consultants may call them, but Emma may not WhatsApp/SMS them until they opt in.
   */
  messagingConsent?: MessagingConsent;
};

export type MessagingConsent = "opted_in" | "opted_out" | "none";

/** Where a Clinics lead came from. `public_scrape` = public business listings (e.g. Google). */
export const LEAD_SOURCES = ["public_scrape", "landing_page", "consultant_portal", "referral", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

/** Managers send scraper results into the Clinics pool (unassigned). */
export const ScrapedLeadImport = z.object({
  leads: z
    .array(
      z.object({
        businessName: z.string().trim().min(1).max(160),
        phone: z.string().trim().max(32).nullable(),
        email: z.string().trim().max(160).nullable(),
        website: z.string().trim().max(300).nullable(),
        address: z.string().trim().max(300).nullable(),
        placeId: z.string().trim().max(200).nullable(),
        ownerName: z.string().trim().max(120).nullable(),
        /** Public page the details were taken from (POPIA s.18: we must be able to tell them). */
        sourceUrl: z.string().trim().max(500).nullable(),
      }),
    )
    .min(1)
    .max(500),
});
export type ScrapedLeadImport = z.infer<typeof ScrapedLeadImport>;
export type ScrapedImportResult = { imported: number; duplicates: number; rejectedNonZaPhone: number };

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

// ═══════════════════════════════════════════════════════════════════════════
// WAVE 2 — calculator, Why Board, leaderboard, meetings + calendar sync,
// payments + commission, scoring, training, Emma, n8n, platform events.
// See docs/consultant-portal/SPEC-WAVE2.md. Localisation is fixed: money is
// ZAR (whole rand), phones are SA +27, time is SAST (Africa/Johannesburg).
// ═══════════════════════════════════════════════════════════════════════════

export const SAST_TIME_ZONE = "Africa/Johannesburg" as const;
export const CURRENCY = "ZAR" as const;

/** Stricter than `normalizeE164`: only South African (+27) numbers are accepted. */
export function normalizeZaPhone(input: string): string | null {
  const n = normalizeE164(input);
  return n && /^\+27\d{9}$/.test(n) ? n : null;
}

// ── Meetings (discovery / demo) + calendar sync ─────────────────────────────

export const MEETING_KINDS = ["discovery", "demo", "follow_up"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];

export const MEETING_STATUSES = ["scheduled", "held", "no_show", "cancelled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const CALENDAR_PROVIDERS = ["google", "microsoft"] as const;
export type CalendarProvider = (typeof CALENDAR_PROVIDERS)[number];

export const MeetingInput = z.object({
  leadId: z.string().uuid(),
  kind: z.enum(MEETING_KINDS),
  /** ISO with offset; the UI builds it from SAST wall-clock input. */
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(10).max(180).default(30),
  /** Send a calendar invite to the clinic contact's email (if the lead has one). */
  inviteClinic: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional(),
});
export type MeetingInput = z.infer<typeof MeetingInput>;

export const MeetingPatch = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    durationMin: z.number().int().min(10).max(180),
    status: z.enum(MEETING_STATUSES),
    notes: z.string().trim().max(1000).nullable(),
  })
  .partial()
  .refine((p) => Object.keys(p).length > 0, "Nothing to update");
export type MeetingPatch = z.infer<typeof MeetingPatch>;

export type CalendarSyncState = "synced" | "pending" | "failed" | "not_connected";

export type Meeting = {
  id: string;
  leadId: string;
  clinicName: string;
  consultantId: string;
  kind: MeetingKind;
  status: MeetingStatus;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  sync: Record<CalendarProvider, CalendarSyncState>;
  createdAt: string;
};

export type CalendarConnection = {
  provider: CalendarProvider;
  accountEmail: string | null;
  status: "connected" | "error" | "not_connected";
  connectedAt: string | null;
  lastError: string | null; // generic, never provider error text
};

// ── Payments + commission ───────────────────────────────────────────────────

export const DEAL_STATUSES = ["draft", "sent", "accepted", "paid", "lost"] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

/** Manager confirms payment (proof of payment / confirmation). PayFast later. */
export const PaymentConfirmInput = z.object({
  /** Amount received in whole rand. Commission is calculated on this. */
  amount: z.number().int().min(1).max(50_000_000),
  reference: z.string().trim().min(1).max(120),
  paidAt: z.string().datetime({ offset: true }),
  /** Storage path returned by an `UploadTicket` for purpose `payment_proof`. */
  proofPath: z.string().max(300).optional(),
  note: z.string().trim().max(500).optional(),
});
export type PaymentConfirmInput = z.infer<typeof PaymentConfirmInput>;

export type Deal = {
  id: string;
  leadId: string;
  consultantId: string | null;
  saleValue: number | null; // ZAR
  status: DealStatus;
  wonAt: string | null;
  paidAt: string | null;
  paymentAmount: number | null;
  paymentReference: string | null;
  hasProof: boolean;
  confirmedByName: string | null;
  commissionRate: number | null; // e.g. 0.25, frozen at payment time
  commissionAmount: number | null; // ZAR
};

// ── Uploads (private Supabase Storage, signed URLs only) ────────────────────

export const UPLOAD_PURPOSES = ["goal_image", "payment_proof"] as const;
export type UploadPurpose = (typeof UPLOAD_PURPOSES)[number];

export const UploadRequest = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  bytes: z.number().int().min(1).max(5 * 1024 * 1024),
});
export type UploadRequest = z.infer<typeof UploadRequest>;

export type UploadTicket = { path: string; uploadUrl: string; expiresAt: string };

// ── Why Board ───────────────────────────────────────────────────────────────

export const GOAL_METRICS = ["commission", "revenue", "deals_paid", "dials", "connects", "meetings_held"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GoalInput = z.object({
  title: z.string().trim().min(1).max(120),
  /** The personal reason — "why this matters to me". */
  why: z.string().trim().max(1000).default(""),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  metric: z.enum(GOAL_METRICS),
  /** In the metric's unit: rand for commission/revenue, a count otherwise. */
  targetValue: z.number().int().min(1).max(100_000_000),
  imagePath: z.string().max(300).optional(),
});
export type GoalInput = z.infer<typeof GoalInput>;

export const GoalPatch = GoalInput.partial().extend({ imagePath: z.string().max(300).nullable().optional() }).refine(
  (p) => Object.keys(p).length > 0,
  "Nothing to update",
);
export type GoalPatch = z.infer<typeof GoalPatch>;

export type Goal = {
  id: string;
  consultantId: string;
  consultantName: string;
  title: string;
  why: string;
  targetDate: string;
  metric: GoalMetric;
  targetValue: number;
  /** Progress since the goal was created. */
  currentValue: number;
  progress: number; // 0..1
  /** What the calculator says is needed per working day from today to hit it. */
  dailyPlan: CalculatorResult | null;
  imageUrl: string | null; // short-lived signed URL
  createdAt: string;
  updatedAt: string | null;
};

// ── Metrics, calculator, leaderboard ───────────────────────────────────────

export const PERIODS = ["today", "week", "month", "quarter"] as const;
export type Period = (typeof PERIODS)[number];

/** The full funnel a sales leader monitors. Rates are 0..1, null when the denominator is 0. */
export type FunnelMetrics = {
  period: Period;
  from: string;
  to: string;
  dials: number;
  connects: number; // answered calls
  conversations: number; // answered calls ≥ cfg.metrics.conversationMinSec
  talkTimeSec: number;
  meetingsBooked: number;
  meetingsHeld: number;
  noShows: number;
  proposals: number;
  won: number;
  paid: number;
  revenuePaid: number; // ZAR
  commission: number; // ZAR
  rates: {
    connectRate: number | null; // connects / dials
    connectToMeeting: number | null; // meetingsBooked / connects
    showRate: number | null; // meetingsHeld / (meetingsHeld + noShows)
    meetingToPaid: number | null; // paid / meetingsHeld
    proposalToPaid: number | null;
    closeFromDials: number | null; // paid / dials
    closeFromConnects: number | null; // paid / connects — the headline 30% target
  };
  avgSale: number | null;
  salesCycleDays: number | null; // median lead-created → paid
  pipelineValue: number; // open deals, ZAR
  weightedPipeline: number; // Σ value × win probability
  /** Pipeline velocity (ZAR/day) = open opps × win rate × avg sale / cycle days. */
  velocityPerDay: number | null;
};

export const CalculatorInput = z.object({
  goalType: z.enum(["commission", "revenue", "deals"]),
  goalValue: z.number().int().min(1).max(100_000_000),
  /** SA working days left in the window (the UI computes default from dates). */
  workingDays: z.number().int().min(1).max(260),
  avgSale: z.number().int().min(1).max(10_000_000),
  closeFromConnects: z.number().min(0.001).max(1),
  connectRate: z.number().min(0.001).max(1),
  commissionRate: z.number().min(0).max(1),
});
export type CalculatorInput = z.infer<typeof CalculatorInput>;

export type CalculatorResult = {
  dealsNeeded: number;
  connectsNeeded: number;
  dialsNeeded: number;
  perDay: { dials: number; connects: number; deals: number };
  revenue: number;
  commission: number;
};

export const TIER_IDS = ["tier1_monthly_achiever", "tier2_high_performer", "tier3_quarter_top"] as const;
export type TierId = (typeof TIER_IDS)[number];

export type TierStatus = {
  tier: TierId;
  label: string;
  reward: string; // e.g. "R500 Takealot voucher"
  periodKey: string; // "2026-10" or "2026-Q4"
  threshold: number; // ZAR revenue paid (tier3: rank cut-off shown separately)
  current: number;
  progress: number; // 0..1
  achieved: boolean;
};

export type LeaderboardRow = {
  consultantId: string;
  name: string;
  rank: number;
  points: number;
  revenuePaid: number;
  dealsPaid: number;
  commission: number; // visible to all consultants by decision
  dials: number;
  connects: number;
  meetingsBooked: number;
  meetingsHeld: number;
  closeFromDials: number | null;
  closeFromConnects: number | null;
  quarterTarget: number;
  quarterProgress: number; // 0..1
  tiers: TierStatus[];
};

export type Leaderboard = { period: Period; rankedBy: "points" | "revenue"; rows: LeaderboardRow[]; generatedAt: string };

// ── Gamification settings (editable by Acquisition & Creative) ──────────────

export const GamificationSettings = z.object({
  quarterTarget: z.number().int().min(0),
  tier1: z.object({ label: z.string().max(60), monthlyRevenue: z.number().int().min(0), reward: z.string().max(80) }),
  tier2: z.object({ label: z.string().max(60), monthlyRevenue: z.number().int().min(0), reward: z.string().max(80) }),
  tier3: z.object({
    label: z.string().max(60),
    topN: z.number().int().min(1).max(20),
    minQuarterRevenue: z.number().int().min(0),
    reward: z.string().max(80),
  }),
  points: z.object({
    dial: z.number().int().min(0),
    connect: z.number().int().min(0),
    meetingBooked: z.number().int().min(0),
    meetingHeld: z.number().int().min(0),
    proposal: z.number().int().min(0),
    won: z.number().int().min(0),
    paid: z.number().int().min(0),
  }),
  closeTargetFromConnects: z.number().min(0).max(1),
});
export type GamificationSettings = z.infer<typeof GamificationSettings>;

export type Reward = {
  id: string;
  consultantId: string;
  consultantName: string;
  tier: TierId;
  periodKey: string;
  reward: string;
  achievedAt: string;
  fulfilledAt: string | null;
  fulfilledByName: string | null;
};

// ── Deal scoring (explainable churn risk + CLV) ─────────────────────────────

export type DealScore = {
  winProbability: number; // 0..1
  churnRisk: number; // 0..1 — probability the deal stalls or is lost
  churnBand: "low" | "medium" | "high";
  clv: number; // ZAR — expected lifetime value
  factors: { label: string; impact: number }[]; // +/- contribution, plain English
  model: string; // e.g. "heuristic-v1"
};

// ── Training hub ────────────────────────────────────────────────────────────

export type TrainingModule = {
  id: string;
  order: number; // 1..6
  title: string;
  summary: string;
  videoUrl: string | null; // null until the clip is uploaded
  durationSec: number;
  completedAt: string | null;
  locked: boolean; // sequential: unlocked when the previous one is complete
};

// ── Platform events (outbox → n8n + Jono's EMMA) ────────────────────────────
// Business events only. Never includes clinic contact phone/email or transcript text.

export const EVENT_TYPES = [
  "lead.created",
  "lead.claimed",
  "lead.stage_changed",
  "meeting.scheduled",
  "meeting.held",
  "meeting.no_show",
  "meeting.cancelled",
  "call.completed",
  "deal.won",
  "deal.paid",
  "reward.tier_achieved",
  "emma.message_dead",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type PlatformEvent = {
  id: string; // uuid — the idempotency key for every receiver
  type: EventType;
  occurredAt: string;
  vertical: typeof CLINICS_VERTICAL;
  lead: { id: string; clinicName: string; stage: SalesStage; previousStage: SalesStage | null } | null;
  consultant: { id: string; name: string } | null;
  data: Record<string, string | number | boolean | null>;
};

// ── Emma (WhatsApp / SMS automation) ────────────────────────────────────────

export const EMMA_AUDIENCES = ["lead", "consultant", "owner"] as const;
export type EmmaAudience = (typeof EMMA_AUDIENCES)[number];

export const EMMA_MESSAGE_STATUSES = ["queued", "sending", "sent", "delivered", "read", "failed", "dead", "skipped"] as const;
export type EmmaMessageStatus = (typeof EMMA_MESSAGE_STATUSES)[number];

export type EmmaMessage = {
  id: string;
  audience: EmmaAudience;
  leadId: string | null;
  consultantId: string | null;
  channel: "whatsapp" | "sms";
  template: string;
  status: EmmaMessageStatus;
  attempts: number;
  lastError: string | null; // generic
  createdAt: string;
  sentAt: string | null;
};

// ── n8n ingress (n8n → app). Signed; every action carries an idempotency key. ─

export const N8nIngress = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("emma.send"),
    idempotencyKey: z.string().min(8).max(120),
    leadId: z.string().uuid(),
    template: z.string().min(1).max(80),
    variables: z.record(z.string().max(300)).default({}),
    channel: z.enum(["whatsapp", "sms"]).default("whatsapp"),
  }),
  z.object({
    action: z.literal("emma.notify_consultant"),
    idempotencyKey: z.string().min(8).max(120),
    consultantId: z.string().uuid(),
    template: z.string().min(1).max(80),
    variables: z.record(z.string().max(300)).default({}),
  }),
  z.object({
    action: z.literal("lead.set_next_action"),
    idempotencyKey: z.string().min(8).max(120),
    leadId: z.string().uuid(),
    nextAction: z.string().trim().max(200),
    nextActionAt: z.string().datetime({ offset: true }).nullable(),
  }),
  z.object({ action: z.literal("ping"), idempotencyKey: z.string().min(8).max(120) }),
]);
export type N8nIngress = z.infer<typeof N8nIngress>;

// ── Admin views ─────────────────────────────────────────────────────────────

export type SystemHealth = {
  checkedAt: string;
  database: { ok: boolean; latencyMs: number | null };
  twilio: { configured: boolean };
  anthropic: { configured: boolean };
  n8n: { configured: boolean; lastDeliveryAt: string | null; pending: number; dead: number };
  emmaOwner: { configured: boolean; lastDeliveryAt: string | null; pending: number; dead: number };
  emmaMessages: { queued: number; failed24h: number; dead: number };
  calendars: { connected: number; errors: number };
  summaries: { pending: number; failed: number };
};

/** Lead search goes in a POST body so phone numbers never appear in URLs/logs. */
export const LeadSearchInput = z.object({
  q: z.string().trim().max(120).default(""),
  stage: z.enum(SALES_STAGES).optional(),
  scope: z.enum(["mine", "pool", "all"]).default("mine"),
});
export type LeadSearchInput = z.infer<typeof LeadSearchInput>;
