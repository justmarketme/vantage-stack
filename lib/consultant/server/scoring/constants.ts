import type { SalesStage } from "../../types";

/**
 * heuristic-v1 deal-scoring constants — every weight in one place (Andrew Ng lens: lightweight,
 * explainable, recalibrated as won/lost data accrues). These are STARTING priors, not fitted
 * values: once there are ~100 closed Clinics deals, refit STAGE_WIN_BASE from actual stage →
 * paid conversion and tune the weights against paid/lost outcomes, then bump MODEL_VERSION.
 *
 * All adjustments are in LOG-ODDS: a factor of +0.7 roughly doubles the odds of paying, −0.7
 * halves them. That keeps every factor additive and explainable ("stalled: −0.55").
 */

export const MODEL_VERSION = "heuristic-v1";

/**
 * P(this lead eventually PAYS | its current stage), before any adjustment. A sale counts when
 * it is paid, so `won` is high but not certain (payment risk) and `paid` is 1.
 */
export const STAGE_WIN_BASE: Record<SalesStage, number> = {
  new: 0.03,
  contacted: 0.06,
  discovery_booked: 0.15,
  no_show: 0.08,
  demo_done: 0.3,
  proposal: 0.5,
  won: 0.85,
  paid: 1,
  lost: 0,
};

/**
 * P(the deal stalls or is lost from here | stage), before adjustment. Early stages and no-shows
 * are naturally risky; a won deal mostly risks non-payment.
 */
export const STAGE_CHURN_BASE: Record<SalesStage, number> = {
  new: 0.5,
  contacted: 0.45,
  discovery_booked: 0.35,
  no_show: 0.6,
  demo_done: 0.3,
  proposal: 0.25,
  won: 0.1,
  paid: 0,
  lost: 1,
};

/** Stage order used to decide whether Coach Alex's recommended stage is ahead or behind. */
export const STAGE_ORDER: Record<SalesStage, number> = {
  new: 0,
  contacted: 1,
  discovery_booked: 2,
  no_show: 2,
  demo_done: 3,
  proposal: 4,
  won: 5,
  paid: 6,
  lost: -1,
};

export const WEIGHTS = {
  /**
   * Velocity: stall ratio r = days in stage ÷ median days in this stage across open Clinics
   * leads. Impact = −velocity × ln(r), with r clamped to [velocityMinRatio, velocityMaxRatio].
   * Twice the usual time ⇒ −0.35; six times ⇒ −0.9; half the usual time ⇒ +0.35.
   */
  velocity: 0.5,
  velocityMinRatio: 0.5,
  velocityMaxRatio: 6,
  /** Stages younger than this are not judged on velocity (not enough time to stall). */
  velocityGraceDays: 1,
  /** Median floor so a stage everyone passes in hours doesn't make day-2 look like a stall. */
  medianFloorDays: 2,

  /** Recency: each day since the last touch beyond `recencyGraceDays` costs this much, capped. */
  recencyPerDay: 0.08,
  recencyGraceDays: 3,
  recencyCap: 1.2,

  /** Call outcomes. */
  positiveDisposition: 0.4, // discovery / demo booked on a call
  positiveDispositionCap: 0.8,
  notInterested: -1.0, // the most recent wrap-up said "not interested"
  answeredCall: 0.1, // each answered call shows engagement…
  answeredCallCap: 0.3, // …up to a cap
  unansweredStreak: -0.15, // each consecutive unanswered call since the last answered one
  unansweredStreakCap: -0.6,

  /** Coach Alex's read of the last summarised call. */
  sentimentPositive: 0.4,
  sentimentNegative: -0.6,
  recommendedAhead: 0.3,
  recommendedLost: -0.8,

  /** Meetings. */
  noShow: -0.5,
  noShowCap: -1.0,
  meetingHeld: 0.3,
  upcomingMeeting: 0.3,

  /** A scheduled next action in the future is a plan; an overdue one is a slipped promise. */
  nextActionPlanned: 0.15,
  nextActionOverdue: -0.3,
} as const;

/** Win probability is kept inside this band for open deals (no false certainty). */
export const OPEN_PROBABILITY_BAND = { min: 0.01, max: 0.99 } as const;

/** churnRisk thresholds → band. */
export const CHURN_BANDS = { mediumFrom: 0.35, highFrom: 0.6 } as const;

/**
 * CLV = monthly value × EXPECTED_RETENTION_MONTHS × win probability.
 * `dealValue` is the clinic's MONTHLY subscription in ZAR (LeadPatch contract). 18 months is a
 * conservative planning assumption for a B2B booking-agent subscription with no churn history
 * yet; replace it with observed average tenure once clinics have churned or renewed.
 */
export const EXPECTED_RETENTION_MONTHS = 18;

/** Last N calls considered for the disposition / unanswered-streak features. */
export const RECENT_CALLS = 10;
