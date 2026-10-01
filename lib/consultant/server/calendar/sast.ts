import { SAST_TIME_ZONE } from "../../types";

/**
 * SAST (Africa/Johannesburg) date/time helpers for the server. Pure; unit-tested.
 *
 * South Africa has no daylight saving, so SAST is always UTC+02:00 — but we still format via
 * Intl with the IANA zone so the code never silently depends on that fact.
 */

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: SAST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function parts(d: Date): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of PARTS.formatToParts(d)) out[p.type] = p.value;
  return out;
}

/** `2026-10-05T09:00:00` — the SAST wall clock with no offset (what Microsoft Graph wants). */
export function sastWallClock(d: Date | string): string {
  const p = parts(new Date(d));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** Minutes SAST is ahead of UTC at instant `d` (always 120 today). */
export function sastOffsetMinutes(d: Date | string): number {
  const date = new Date(d);
  const wall = Date.parse(`${sastWallClock(date)}Z`);
  return Math.round((wall - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

/** `2026-10-05T09:00:00+02:00` — RFC 3339 with the SAST offset (what Google Calendar wants). */
export function sastRfc3339(d: Date | string): string {
  const off = sastOffsetMinutes(d);
  const sign = off >= 0 ? "+" : "-";
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sastWallClock(d)}${sign}${hh}:${mm}`;
}

/** `2026-10-05` — the SAST calendar date of an instant. */
export function sastDateKey(d: Date | string): string {
  return sastWallClock(d).slice(0, 10);
}

/** Human SAST label for messages, e.g. `05 Oct 2026, 09:00 SAST`. */
export function sastLabel(d: Date | string): string {
  const s = new Intl.DateTimeFormat("en-ZA", {
    timeZone: SAST_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(d));
  return `${s} SAST`;
}

/** The UTC instant of SAST midnight at the start of the SAST day containing `d`. */
export function sastStartOfDay(d: Date | string): Date {
  const key = sastDateKey(d);
  const guess = new Date(`${key}T00:00:00Z`);
  return new Date(guess.getTime() - sastOffsetMinutes(guess) * 60_000);
}
