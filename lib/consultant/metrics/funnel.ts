import type { FunnelMetrics, Period } from "../types";

/**
 * Funnel maths — pure. The SQL in `server/repo/metrics.ts` produces raw counts (`FunnelCounts`);
 * everything derived (rates, averages, velocity) is computed here so it is unit-tested.
 *
 * Rates are 0..1 and null when their denominator is 0 (never NaN / Infinity):
 *   connectRate       = connects ÷ dials
 *   connectToMeeting  = meetingsBooked ÷ connects
 *   showRate          = meetingsHeld ÷ (meetingsHeld + noShows)
 *   meetingToPaid     = paid ÷ meetingsHeld
 *   proposalToPaid    = paid ÷ proposals
 *   closeFromDials    = paid ÷ dials
 *   closeFromConnects = paid ÷ connects        ← the headline 30% target
 *
 * avgSale           = revenuePaid ÷ paid (whole rand), null when nothing was paid
 * salesCycleDays    = median of (lead created → paid) in days, 1 decimal
 * velocityPerDay    = openOpportunities × winRate × avgSale ÷ salesCycleDays (ZAR/day), where
 *                     winRate = paid ÷ (paid + lost) for deals closed in the period. Null when
 *                     any input is unknown or the cycle is 0.
 */

export type FunnelCounts = {
  dials: number;
  connects: number;
  conversations: number;
  talkTimeSec: number;
  meetingsBooked: number;
  meetingsHeld: number;
  noShows: number;
  proposals: number;
  won: number;
  paid: number;
  lost: number;
  revenuePaid: number;
  commission: number;
  /** Lead-created → paid durations (days) for deals paid in the period. */
  cycleDays: number[];
  pipelineValue: number;
  weightedPipeline: number;
  openOpportunities: number;
};

export function emptyCounts(): FunnelCounts {
  return {
    dials: 0,
    connects: 0,
    conversations: 0,
    talkTimeSec: 0,
    meetingsBooked: 0,
    meetingsHeld: 0,
    noShows: 0,
    proposals: 0,
    won: 0,
    paid: 0,
    lost: 0,
    revenuePaid: 0,
    commission: 0,
    cycleDays: [],
    pipelineValue: 0,
    weightedPipeline: 0,
    openOpportunities: 0,
  };
}

/** Sum several consultants' counts into a team total (cycle days are pooled, not averaged). */
export function sumCounts(list: FunnelCounts[]): FunnelCounts {
  const t = emptyCounts();
  for (const c of list) {
    for (const k of Object.keys(t) as (keyof FunnelCounts)[]) {
      if (k === "cycleDays") t.cycleDays.push(...c.cycleDays);
      else (t[k] as number) += c[k] as number;
    }
  }
  return t;
}

export function ratio(num: number, den: number): number | null {
  if (!(den > 0) || !Number.isFinite(num)) return null;
  return num / den;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

export function buildFunnel(period: Period, range: { from: string; to: string }, c: FunnelCounts): FunnelMetrics {
  const avgSale = c.paid > 0 ? Math.round(c.revenuePaid / c.paid) : null;
  const med = median(c.cycleDays);
  const salesCycleDays = med === null ? null : Math.round(med * 10) / 10;
  const winRate = ratio(c.paid, c.paid + c.lost);
  const velocityPerDay =
    winRate !== null && avgSale !== null && salesCycleDays !== null && salesCycleDays > 0
      ? Math.round((c.openOpportunities * winRate * avgSale) / salesCycleDays)
      : null;

  return {
    period,
    from: range.from,
    to: range.to,
    dials: c.dials,
    connects: c.connects,
    conversations: c.conversations,
    talkTimeSec: c.talkTimeSec,
    meetingsBooked: c.meetingsBooked,
    meetingsHeld: c.meetingsHeld,
    noShows: c.noShows,
    proposals: c.proposals,
    won: c.won,
    paid: c.paid,
    revenuePaid: c.revenuePaid,
    commission: c.commission,
    rates: {
      connectRate: ratio(c.connects, c.dials),
      connectToMeeting: ratio(c.meetingsBooked, c.connects),
      showRate: ratio(c.meetingsHeld, c.meetingsHeld + c.noShows),
      meetingToPaid: ratio(c.paid, c.meetingsHeld),
      proposalToPaid: ratio(c.paid, c.proposals),
      closeFromDials: ratio(c.paid, c.dials),
      closeFromConnects: ratio(c.paid, c.connects),
    },
    avgSale,
    salesCycleDays,
    pipelineValue: Math.round(c.pipelineValue),
    weightedPipeline: Math.round(c.weightedPipeline),
    velocityPerDay,
  };
}
