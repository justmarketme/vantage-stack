/**
 * Server-side strings and tunables for the Consultant Portal backend that are not (yet) in
 * `lib/consultant/config.ts`. config.ts is a fixed contract, so every value here is listed
 * under "Contract requests" in the Agent 3 report and should move into `consultantConfig()`
 * once the coordinator accepts it. Nothing in this file is secret or environment-specific.
 *
 * TODO(contract-request CR-1): move MESSAGES into cfg.messages.
 * TODO(contract-request CR-2): move TIMINGS into cfg.twilio / cfg.ai.
 * TODO(contract-request CR-3): move CRM_FEED into cfg.pipeline.
 */

/** Every user-facing error / spoken message the backend emits. Generic by design (no PII, no internals). */
export const MESSAGES = {
  paidStageLocked: "A deal becomes Paid only when a manager confirms the payment, and a paid deal can't change stage here.",
  badRequest: "Please check the highlighted fields.",
  invalidJson: "The request body is not valid JSON.",
  unauthorized: "Unauthorized",
  readOnly: "This account is read-only.",
  managersOnly: "Only managers can do that.",
  notFound: "Not found.",
  leadNotFound: "Lead not found.",
  callNotFound: "Call not found.",
  noteNotFound: "Note not found.",
  duplicatePhone: "A Clinics lead with this phone number already exists.",
  duplicateEmail: "A CRM client with this email already exists.",
  alreadyClaimed: "This lead has already been claimed.",
  unknownConsultant: "Unknown consultant.",
  leadHasNoPhone: "This lead has no phone number to call.",
  liveCallExists: "You already have a call in progress.",
  rateLimited: "Too many requests. Please wait a moment.",
  voiceUnavailable: "Calling isn't available right now.",
  noteConflict: "This note was changed by someone else. Reload it and try again.",
  noRecording: "No recording is available for this call.",
  recordingUnavailable: "The recording couldn't be loaded. Try again shortly.",
  serverError: "Something went wrong. Please try again.",
  dbUnavailable: "The service is temporarily unavailable. Please try again.",
  notYourCall: "Only the consultant on this call can do that.",
  /** Spoken by Twilio to the consultant when the TwiML webhook refuses to place a call. */
  callRefusedSpoken: "Sorry, this call can't be placed right now. Please try again from the portal.",
  /** Summary failure reasons stored on the call row (shown to users; generic on purpose). */
  summaryRefused: "Coach Alex couldn't review this call.",
  summaryFailed: "Coach Alex couldn't finish this summary. It will retry automatically.",
  summaryTruncated: "The summary was cut short. It will retry automatically.",
  summarySkippedShort: "Call too short to summarise.",
  summarySkippedEmpty: "No transcript was captured for this call.",
  summarySkippedNoKey: "AI summaries are not configured.",
} as const;

export const TIMINGS = {
  /** Wait after a call completes before summarising, so the last transcription webhooks land. */
  summariseGraceMs: 8_000,
  /** A call still `initiated` with no Twilio CallSid after this long never connected. */
  initiatedStaleSec: 90,
  /** A summary stuck in `processing` this long (crashed worker) is released for retry. */
  processingTimeoutSec: 600,
  /** Extra slack on top of dial timeout + max call length before the sweep force-closes a call. */
  callCloseSlackSec: 300,
  /** Calls summarised per sweep run (each is one Claude request). */
  sweepBatch: 5,
  /**
   * Stop starting new summaries after this long in one sweep run. Every portal route is
   * capped at 60s (Vercel Hobby); one summary may take up to AI.requestTimeoutMs (45s), so
   * 10s + 45s stays inside the cap.
   */
  sweepSummariseBudgetMs: 10_000,
  /** Twilio recordings deleted per sweep run (retention). */
  retentionRecordingBatch: 50,
  /** Calls whose transcript segments are purged per sweep run (retention). */
  retentionTranscriptBatch: 200,
  /** IANA zone that defines "today" for TodayStats. */
  statsTimeZone: "Africa/Johannesburg",
} as const;

export const AI = {
  /**
   * Claude Opus 5.5: thinking is always on; effort is the depth control. "low" keeps a call
   * summary comfortably inside the 60s Vercel Hobby function cap. On Vercel Pro (longer
   * functions) this can go back to "medium" with a longer requestTimeoutMs.
   */
  effort: "low",
  /** Server-side refusal fallback — the scalar "default" form needs this beta header. */
  fallbackBeta: "server-side-fallback-2026-07-01",
  /**
   * Per-request timeout. The whole summary (plus the ~8s transcript grace) must finish inside
   * the route's 60s maxDuration (Vercel Hobby). A timeout marks the summary failed and the
   * sweep retries it later (up to cfg.ai.maxSummaryAttempts).
   */
  requestTimeoutMs: 45_000,
  /** No in-request SDK retry (it would blow the 60s cap); the sweep retries instead. */
  maxRetries: 0,
} as const;

export const TWILIO = {
  /** REST base for the recording media proxy. TODO(contract-request CR-2): cfg.twilio.apiBase. */
  apiBase: "https://api.twilio.com/2010-04-01",
} as const;

export const CRM_FEED = {
  /** Author name on AI summary notes. */
  coachName: "Coach Alex",
  /** `clients.lead_source` when a consultant creates a lead without naming a source. */
  defaultLeadSource: "consultant_portal",
  /** `clients.lead_source` for clinic landing-page enquiries. */
  landingLeadSource: "clinics_landing",
  /**
   * `public.clients.email` is NOT NULL UNIQUE (migration 001). Leads without an email get a
   * stable internal placeholder (same convention as the lead-scraper import), which the API
   * never returns — `Lead.email` is null for these rows.
   */
  placeholderEmailDomain: "internal.vantagestack",
  /** `client_communications.body_preview` cap. */
  previewMaxChars: 500,
  /** `deals.proposal_status` mirrored from the sales stage. */
  dealStatus: { won: "accepted", proposal: "sent", lost: "lost", open: "draft" },
  /** `crm_activity.action_type` values. */
  activity: {
    call: "consultant_call",
    stageChange: "consultant_stage_change",
    note: "consultant_note",
    leadCreated: "consultant_lead_created",
    leadClaimed: "consultant_lead_claimed",
  },
} as const;
