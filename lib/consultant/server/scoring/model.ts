import type { CallDisposition, DealScore, SalesStage } from "../../types";
import { SALES_STAGE_LABELS } from "../../types";
import {
  CHURN_BANDS,
  EXPECTED_RETENTION_MONTHS,
  MODEL_VERSION,
  OPEN_PROBABILITY_BAND,
  STAGE_CHURN_BASE,
  STAGE_ORDER,
  STAGE_WIN_BASE,
  WEIGHTS as W,
} from "./constants";

/**
 * heuristic-v1 — pure, explainable deal scoring.
 *
 * 1. Start from the stage's base rates (STAGE_WIN_BASE / STAGE_CHURN_BASE) in log-odds.
 * 2. Each feature adds a signed log-odds "impact" (see WEIGHTS for the rationale of each).
 * 3. winProbability = σ(logit(winBase) + Σ impacts), clamped to a band for open deals.
 *    churnRisk      = σ(logit(churnBase) − Σ impacts): the SAME evidence pushes the other way,
 *    so anything that makes a deal likelier to pay makes it less likely to stall and vice versa.
 * 4. CLV = value × EXPECTED_RETENTION_MONTHS × winProbability.
 * 5. `factors` are the non-zero impacts in plain English, biggest first.
 *
 * Terminal stages: `paid` ⇒ win 1 / churn 0; `lost` ⇒ win 0 / churn 1 (no adjustments).
 *
 * Monotonicity (unit-tested): more days in stage, more days since the last touch, more no-shows
 * or an unanswered streak can only lower win probability and raise churn risk.
 */

export type ScoreFeatures = {
  stage: SalesStage;
  daysInStage: number;
  /** Median days currently spent in this stage by open Clinics leads (SQL), null if unknown. */
  medianDaysInStage: number | null;
  daysSinceLastTouch: number;
  answeredCalls: number;
  /** Consecutive most-recent calls that were not answered. */
  unansweredStreak: number;
  positiveDispositions: number;
  lastDisposition: CallDisposition | null;
  lastSentiment: "positive" | "neutral" | "negative" | null;
  recommendedStage: SalesStage | null;
  noShows: number;
  meetingsHeld: number;
  upcomingMeetings: number;
  nextAction: "planned" | "overdue" | "none";
  /** Monthly value in ZAR (the deal value, else the average sale). */
  value: number;
};

export type Factor = { label: string; impact: number };

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round2 = (x: number) => Math.round(x * 100) / 100;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The feature → impact rules, in the order they are explained. */
export function factorsFor(f: ScoreFeatures): Factor[] {
  const out: Factor[] = [];
  const add = (label: string, impact: number) => {
    if (Math.abs(impact) >= 0.005) out.push({ label, impact: round2(impact) });
  };
  const stageLabel = SALES_STAGE_LABELS[f.stage];

  // Velocity — only once the lead has had time to stall.
  if (f.medianDaysInStage !== null && f.daysInStage >= W.velocityGraceDays) {
    const median = Math.max(f.medianDaysInStage, W.medianFloorDays);
    const r = clamp(f.daysInStage / median, W.velocityMinRatio, W.velocityMaxRatio);
    const impact = -W.velocity * Math.log(r);
    const days = Math.floor(f.daysInStage);
    if (impact < 0) add(`${plural(days, "day")} in ${stageLabel}, ${(f.daysInStage / median).toFixed(1)}× the usual pace`, impact);
    else add(`Moving faster than usual through ${stageLabel}`, impact);
  }

  // Recency of the last touch (call, meeting or stage change).
  const idle = f.daysSinceLastTouch - W.recencyGraceDays;
  if (idle > 0) add(`No contact for ${plural(Math.floor(f.daysSinceLastTouch), "day")}`, -Math.min(W.recencyCap, idle * W.recencyPerDay));

  // Call outcomes.
  if (f.positiveDispositions > 0) {
    add(`${plural(f.positiveDispositions, "call")} ended with a meeting booked`, Math.min(W.positiveDispositionCap, f.positiveDispositions * W.positiveDisposition));
  }
  if (f.lastDisposition === "not_interested") add("Last call: not interested", W.notInterested);
  if (f.answeredCalls > 0) add(`${plural(f.answeredCalls, "answered call")}`, Math.min(W.answeredCallCap, f.answeredCalls * W.answeredCall));
  if (f.unansweredStreak > 0) {
    add(`Last ${plural(f.unansweredStreak, "call")} unanswered`, Math.max(W.unansweredStreakCap, f.unansweredStreak * W.unansweredStreak));
  }

  // Coach Alex's read of the last reviewed call.
  if (f.lastSentiment === "positive") add("Coach Alex: clinic sounded positive", W.sentimentPositive);
  if (f.lastSentiment === "negative") add("Coach Alex: clinic sounded negative", W.sentimentNegative);
  if (f.recommendedStage === "lost") add("Coach Alex suggests this deal is lost", W.recommendedLost);
  else if (f.recommendedStage && STAGE_ORDER[f.recommendedStage] > STAGE_ORDER[f.stage]) {
    add(`Coach Alex suggests moving to ${SALES_STAGE_LABELS[f.recommendedStage]}`, W.recommendedAhead);
  }

  // Meetings.
  if (f.noShows > 0) add(`${plural(f.noShows, "missed meeting")}`, Math.max(W.noShowCap, f.noShows * W.noShow));
  if (f.meetingsHeld > 0) add("Meeting held", W.meetingHeld);
  if (f.upcomingMeetings > 0) add("Meeting scheduled", W.upcomingMeeting);

  // Next action discipline.
  if (f.nextAction === "planned") add("Next step scheduled", W.nextActionPlanned);
  if (f.nextAction === "overdue") add("Next step overdue", W.nextActionOverdue);

  return out.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));
}

export function churnBand(risk: number): DealScore["churnBand"] {
  return risk >= CHURN_BANDS.highFrom ? "high" : risk >= CHURN_BANDS.mediumFrom ? "medium" : "low";
}

export function scoreDeal(f: ScoreFeatures): DealScore {
  const value = Math.max(0, f.value);
  if (f.stage === "paid" || f.stage === "lost") {
    const win = f.stage === "paid" ? 1 : 0;
    return {
      winProbability: win,
      churnRisk: 1 - win,
      churnBand: churnBand(1 - win),
      clv: Math.round(value * EXPECTED_RETENTION_MONTHS * win),
      factors: [{ label: f.stage === "paid" ? "Payment received" : "Deal lost", impact: 0 }],
      model: MODEL_VERSION,
    };
  }

  const factors = factorsFor(f);
  const total = factors.reduce((s, x) => s + x.impact, 0);
  const band = OPEN_PROBABILITY_BAND;
  const win = round3(clamp(sigmoid(logit(STAGE_WIN_BASE[f.stage]) + total), band.min, band.max));
  const churn = round3(clamp(sigmoid(logit(STAGE_CHURN_BASE[f.stage]) - total), band.min, band.max));
  return {
    winProbability: win,
    churnRisk: churn,
    churnBand: churnBand(churn),
    clv: Math.round(value * EXPECTED_RETENTION_MONTHS * win),
    factors,
    model: MODEL_VERSION,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
