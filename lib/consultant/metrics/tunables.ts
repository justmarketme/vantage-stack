/**
 * Agent 3A tunables that are not (yet) in `lib/consultant/config.ts`.
 *
 * config.ts is a fixed contract, so each value here is listed under "Contract requests" in the
 * 3A wave-2 report (CR-3A-1) and should move into `consultantConfig()` once accepted. Nothing
 * here is secret or environment-specific, and this module is pure (safe for client bundles).
 */

export const TUNABLES_3A = {
  delivery: {
    /** HTTP timeout for one event POST to n8n / EMMA. */
    requestTimeoutMs: 10_000,
    /**
     * A claimed delivery is "leased" for this long: if the worker dies mid-POST the row becomes
     * due again after the lease, so nothing is lost (at-least-once; receivers dedupe on event.id).
     */
    leaseSec: 60,
    /** `after()` kicks deliver a small batch so the user's request never waits on it. */
    kickBatch: 20,
  },
  emma: {
    /** HTTP timeout for one Twilio Messages API call. */
    requestTimeoutMs: 10_000,
    /** Lease on a message being sent (same idea as delivery.leaseSec). */
    leaseSec: 90,
    /** Messages sent per cron run / per `after()` kick. */
    batch: 25,
    kickBatch: 5,
  },
  realtime: {
    /** Realtime broadcast REST timeout — nudges are best-effort. */
    requestTimeoutMs: 3_000,
    /** Broadcast event name every nudge uses (the browser listens for this). */
    event: "nudge",
    /**
     * The dispatch cron nudges the leaderboard when a metric-affecting event occurred within
     * this window (cron cadence 60s + slack). A duplicate nudge is harmless: clients refetch.
     */
    leaderboardLookbackSec: 90,
  },
  rewards: {
    /**
     * Tier 3 (quarter top-N) is awarded after the quarter closes. Late payments confirmed in the
     * first days of the next quarter (backdated into the old one) still count within this window;
     * after it, the closed quarter is frozen.
     */
    tier3GraceDays: 7,
    /**
     * Monthly tiers re-check the PREVIOUS month too during this many days of the new month, so a
     * payment confirmed on the 1st but backdated to the 30th still awards the right month.
     */
    monthlyGraceDays: 5,
  },
  calendar: {
    /** Meetings retried per dispatch run (3B's retryCalendarSync). */
    retryBatch: 20,
  },
  admin: {
    /** Rows returned by the dead-letter list per kind. */
    deadLetterLimit: 200,
  },
} as const;

/** User-facing messages from 3A routes — generic by design (no PII, no internals). CR-3A-1. */
export const MESSAGES_3A = {
  dealNotFound: "No deal found for this lead.",
  lostLeadPayment: "A lost lead can't be marked as paid. Reopen it first.",
  alreadyPaid: "This deal is already marked as paid with a different reference or amount.",
  paidAtFuture: "The payment date can't be in the future.",
  badProofPath: "That proof of payment upload isn't valid.",
  noProof: "No proof of payment was uploaded for this deal.",
  proofUnavailable: "The proof of payment couldn't be opened. Try again shortly.",
  notYourLead: "Only the lead's consultant or a manager can do that.",
  forbidden: "You don't have permission to do that.",
  rewardNotFound: "Reward not found.",
  unknownPeriod: "Unknown period.",
  unknownKind: "Unknown dead-letter kind.",
  nothingToRetry: "Nothing to retry — it isn't in the dead-letter queue.",
  leadIdRequired: "leadId is required.",
  badSignature: "Invalid signature.",
  unknownTemplate: "Unknown or mismatched template.",
  ingressConflict: "This idempotency key was already used for a different action.",
  unknownConsultant: "Unknown consultant.",
  notClinicsLead: "Lead not found.",
} as const;
