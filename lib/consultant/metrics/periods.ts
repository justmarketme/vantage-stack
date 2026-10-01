import type { Period } from "../types";

/**
 * SAST period boundaries — pure, device-timezone independent.
 *
 * South Africa Standard Time (Africa/Johannesburg) is UTC+02:00 all year: the country has not
 * observed daylight saving since 1943, and the IANA zone has no transitions since then. So a
 * SAST wall-clock instant is exactly "UTC + 2h", and period arithmetic can be done in UTC on a
 * shifted clock without Intl/ICU. (If that ever changed, only `SAST_OFFSET_MS` would need a
 * lookup — every caller goes through these functions.)
 *
 * Every range is half-open: `from` inclusive, `to` exclusive, as ISO UTC strings.
 * - today   → SAST midnight .. next SAST midnight
 * - week    → Monday 00:00 SAST .. next Monday 00:00 SAST (ISO week, Mon–Sun)
 * - month   → 1st 00:00 SAST .. 1st of next month
 * - quarter → Jan/Apr/Jul/Oct 1st 00:00 SAST .. next quarter start
 */

export const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export type Range = { from: string; to: string };

/** The SAST wall-clock parts of an instant (year, month 1-12, day, weekday 1=Mon..7=Sun). */
export function sastParts(at: Date): { year: number; month: number; day: number; weekday: number } {
  const shifted = new Date(at.getTime() + SAST_OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0 = Sunday
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: dow === 0 ? 7 : dow,
  };
}

/** The UTC instant of SAST midnight on the given SAST calendar date (month may overflow). */
export function sastMidnight(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day) - SAST_OFFSET_MS);
}

function range(from: Date, to: Date): Range {
  return { from: from.toISOString(), to: to.toISOString() };
}

export function quarterOf(month: number): number {
  return Math.floor((month - 1) / 3) + 1;
}

/** [from, to) of the SAST period containing `now`. */
export function periodRange(period: Period, now: Date = new Date()): Range {
  const p = sastParts(now);
  switch (period) {
    case "today":
      return range(sastMidnight(p.year, p.month, p.day), sastMidnight(p.year, p.month, p.day + 1));
    case "week": {
      const start = sastMidnight(p.year, p.month, p.day - (p.weekday - 1));
      return range(start, new Date(start.getTime() + 7 * DAY_MS));
    }
    case "month":
      return range(sastMidnight(p.year, p.month, 1), sastMidnight(p.year, p.month + 1, 1));
    case "quarter": {
      const firstMonth = (quarterOf(p.month) - 1) * 3 + 1;
      return range(sastMidnight(p.year, firstMonth, 1), sastMidnight(p.year, firstMonth + 3, 1));
    }
  }
}

/** The SAST month key of an instant, e.g. "2026-10" (reward period key for Tier 1/2). */
export function monthKey(at: Date): string {
  const p = sastParts(at);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

/** The SAST quarter key of an instant, e.g. "2026-Q4" (reward period key for Tier 3). */
export function quarterKey(at: Date): string {
  const p = sastParts(at);
  return `${p.year}-Q${quarterOf(p.month)}`;
}

/** Range of the month BEFORE the SAST month containing `now`. */
export function previousMonthRange(now: Date = new Date()): Range & { key: string } {
  const p = sastParts(now);
  const from = sastMidnight(p.year, p.month - 1, 1);
  return { ...range(from, sastMidnight(p.year, p.month, 1)), key: monthKey(from) };
}

/** Range of the quarter BEFORE the SAST quarter containing `now`. */
export function previousQuarterRange(now: Date = new Date()): Range & { key: string } {
  const p = sastParts(now);
  const firstMonth = (quarterOf(p.month) - 1) * 3 + 1;
  const from = sastMidnight(p.year, firstMonth - 3, 1);
  return { ...range(from, sastMidnight(p.year, firstMonth, 1)), key: quarterKey(from) };
}

/** Whole SAST days elapsed since the start of the period containing `now` (0 on the first day). */
export function daysIntoPeriod(period: Period, now: Date = new Date()): number {
  return Math.floor((now.getTime() - Date.parse(periodRange(period, now).from)) / DAY_MS);
}

export function isPeriod(v: unknown): v is Period {
  return v === "today" || v === "week" || v === "month" || v === "quarter";
}
