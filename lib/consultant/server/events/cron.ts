import type { Sql } from "postgres";
import { TUNABLES_3A } from "../../metrics/tunables";
import { retryCalendarSync } from "../calendar/retry";
import { sendDueMessages, type SendReport } from "../emma/sender";
import { errorTag, logError } from "../http";
import { awardTiers, type AwardReport } from "../repo/rewards";
import { dispatchDue, nudgeLeaderboardIfChanged, type DispatchReport } from "./dispatch";

/**
 * GET /api/cron/consultant-dispatch — every minute. Each step is independent, bounded and
 * idempotent; one step failing never stops the others (its error class is reported).
 *  1. deliver due platform events (n8n + EMMA)            — dispatchDue
 *  2. send due Emma WhatsApp/SMS                          — sendDueMessages
 *  3. retry failed calendar syncs (3B)                    — retryCalendarSync
 *  4. award Tier 1/2 (month) and Tier 3 (closed quarter)  — awardTiers (inserts emit events…)
 *  5. deliver the events step 4 just created, and nudge open leaderboards if anything
 *     metric-affecting happened in the last ~90s.
 */
export type CronReport = {
  events: DispatchReport | { error: string };
  messages: SendReport | { error: string };
  calendar: { attempted: number; synced: number; failed: number } | { error: string };
  rewards: AwardReport | { error: string };
  leaderboardNudged: boolean;
};

async function step<T>(tag: string, fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    logError(`cron.dispatch.${tag}`, e);
    return { error: errorTag(e) };
  }
}

export async function runDispatchCron(db: Sql): Promise<CronReport> {
  const events = await step("events", () => dispatchDue(db));
  const messages = await step("messages", () => sendDueMessages(db));
  const calendar = await step("calendar", () => retryCalendarSync(db, TUNABLES_3A.calendar.retryBatch));
  const rewards = await step("rewards", () => awardTiers(db));
  if ("awarded" in rewards && rewards.awarded > 0) await step("events.rewards", () => dispatchDue(db));
  const nudged = await step("nudge", () => nudgeLeaderboardIfChanged(db));
  return { events, messages, calendar, rewards, leaderboardNudged: nudged === true };
}
