import type { MeetingKind, MeetingStatus, SalesStage } from "../types";

/**
 * Stage automation driven by meetings. Pure, so the rules are unit-tested in isolation; the
 * meetings repo applies the result to the lead in the SAME transaction as the meeting write.
 *
 * Every function returns the stage the lead should move to, or null to leave it alone. They
 * never move a lead backwards past a later stage (e.g. a demo held on a lead already at
 * proposal leaves it at proposal), and never reopen a lost deal automatically.
 */

/** Forward order of the open pipeline. `no_show` sits beside `discovery_booked`; `lost` is off the line. */
const RANK: Record<SalesStage, number> = {
  new: 0,
  contacted: 1,
  no_show: 2,
  discovery_booked: 2,
  demo_done: 3,
  proposal: 4,
  won: 5,
  paid: 6,
  lost: -1,
};

/** Stages from which booking a meeting means "a discovery is now booked". */
const BOOKABLE_FROM: readonly SalesStage[] = ["new", "contacted", "no_show"];

/**
 * A meeting was just booked.
 * - discovery on a new / contacted / no_show lead → discovery_booked.
 * - demo → at least discovery_booked (same starting set; later stages stay where they are).
 * - follow-up → no change.
 */
export function stageAfterBooking(kind: MeetingKind, current: SalesStage): SalesStage | null {
  if (kind === "follow_up") return null;
  return BOOKABLE_FROM.includes(current) ? "discovery_booked" : null;
}

/**
 * A meeting's status changed.
 * - no_show (any kind) → lead no_show, but only while the lead is still discovery_booked
 *   (a no-show on a lead that has since moved on must not drag it back).
 * - held demo → demo_done, unless the lead is already at demo_done or beyond (or lost).
 * - held discovery / follow-up, scheduled, cancelled → no change.
 */
export function stageAfterStatus(kind: MeetingKind, status: MeetingStatus, current: SalesStage): SalesStage | null {
  if (status === "no_show") return current === "discovery_booked" ? "no_show" : null;
  if (status === "held" && kind === "demo") {
    if (current === "lost") return null;
    return RANK[current] < RANK.demo_done ? "demo_done" : null;
  }
  return null;
}

/** Which status changes are allowed. A cancelled meeting is final (its calendar event is gone). */
export function canChangeStatus(from: MeetingStatus, to: MeetingStatus): boolean {
  if (from === to) return true;
  if (from === "cancelled") return false;
  return true;
}
