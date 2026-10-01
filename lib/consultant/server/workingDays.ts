import { sastDateKey } from "./calendar/sast";
import { isSaPublicHoliday } from "./data/saPublicHolidays";

/**
 * SA working days: Monday–Friday that are not South African public holidays. Pure.
 * Dates are SAST calendar dates (`YYYY-MM-DD`), so a consultant's "today" is the Johannesburg
 * day regardless of the server's or the device's timezone.
 */

function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`); // midday UTC keeps us clear of any date-line edge
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(key: string): boolean {
  const dow = new Date(`${key}T12:00:00Z`).getUTCDay();
  return dow !== 0 && dow !== 6 && !isSaPublicHoliday(key);
}

/**
 * Working days from `fromKey` to `toKey`, BOTH inclusive. 0 when `toKey` is before `fromKey`.
 * Capped at `maxDays` calendar days walked so a far-future date can't spin the loop.
 */
export function workingDaysBetween(fromKey: string, toKey: string, maxDays = 3660): number {
  if (toKey < fromKey) return 0;
  let n = 0;
  let key = fromKey;
  for (let i = 0; i <= maxDays && key <= toKey; i++, key = addDays(key, 1)) {
    if (isWorkingDay(key)) n++;
  }
  return n;
}

/** Working days left from "today in SAST" (included) up to and including `targetDateKey`. */
export function workingDaysUntil(targetDateKey: string, now: Date = new Date()): number {
  return workingDaysBetween(sastDateKey(now), targetDateKey);
}
