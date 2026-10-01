/**
 * Display formatting for the Consultant Portal — ZAR money and SAST time.
 *
 * Hard localisation rules (docs/AGENT_ARCHITECTURE.md → Supplementary):
 * - Money is South African Rand in WHOLE rand: `R12 500` (space thousands
 *   separator, no cents). Built by hand rather than `Intl.NumberFormat("en-ZA")`
 *   because ICU versions disagree on the separator (U+00A0 vs U+202F vs ",")
 *   and on the decimal mark, which would make server and browser text differ.
 * - Every date/time is shown in SAST (`Africa/Johannesburg`) no matter what
 *   timezone the DEVICE is set to — a rep on a laptop still set to London sees
 *   the same meeting time as the clinic. Every formatter passes
 *   `timeZone: "Africa/Johannesburg"` to Intl; nothing reads local time.
 *
 * South Africa has had no daylight-saving time since 1944: SAST is a fixed
 * UTC+02:00 all year. That is what makes `sastWallClockToIso` a pure string
 * operation (no tz database lookup, no ambiguous or missing local hours).
 * If that ever changed, only `SAST_OFFSET` and `sastWallClockToIso` would need
 * a real tz conversion — the Intl-based formatters already follow the tz database.
 *
 * Month/weekday names come from fixed English tables (not ICU) so output is
 * identical in every browser ("Sep", never "Sept").
 */

import { SAST_TIME_ZONE } from "../types";

export const SAST_OFFSET = "+02:00" as const;
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Shown for null/invalid input so layouts keep their shape. */
export const EMPTY_VALUE = "—";

// ── Money ───────────────────────────────────────────────────────────────────

/**
 * `12500` → `R12 500`; `-1200.6` → `-R1 201`; `null` → `—`.
 * Rounds to whole rand (half away from zero). Never shows cents.
 */
export function formatZar(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return EMPTY_VALUE;
  const whole = Math.round(Math.abs(n));
  const sign = n < 0 && whole !== 0 ? "-" : "";
  return `${sign}R${groupThousands(whole)}`;
}

function groupThousands(whole: number): string {
  // Plain loop: toLocaleString would bring back the ICU separator problem.
  const digits = String(whole);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return out;
}

// ── SAST dates and times ────────────────────────────────────────────────────

type SastParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

let partsFormatter: Intl.DateTimeFormat | null = null;
function sastFormatter(): Intl.DateTimeFormat {
  // Numeric parts only; layout is ours. Created once (Intl constructors are slow).
  if (!partsFormatter) {
    partsFormatter = new Intl.DateTimeFormat("en-US", {
      timeZone: SAST_TIME_ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
  }
  return partsFormatter;
}

function toDate(iso: string | Date | null | undefined): Date | null {
  if (iso === null || iso === undefined || iso === "") return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wall-clock fields of an instant as seen in Johannesburg. */
export function sastParts(iso: string | Date): SastParts | null {
  const d = toDate(iso);
  if (!d) return null;
  const p: Record<string, number> = {};
  for (const part of sastFormatter().formatToParts(d)) {
    if (part.type !== "literal") p[part.type] = Number(part.value);
  }
  // Some engines render midnight as 24 even with h23; normalise.
  const hour = p.hour === 24 ? 0 : p.hour;
  // Weekday from the SAST calendar date (UTC arithmetic on the date only).
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { year: p.year, month: p.month, day: p.day, hour, minute: p.minute, weekday };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `Wed 30 Sep 2026` (SAST calendar date). */
export function formatSastDate(iso: string | Date | null | undefined): string {
  const p = iso ? sastParts(iso) : null;
  if (!p) return EMPTY_VALUE;
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} ${p.year}`;
}

/** `14:05` (24-hour, SAST — the South African convention). */
export function formatSastTime(iso: string | Date | null | undefined): string {
  const p = iso ? sastParts(iso) : null;
  if (!p) return EMPTY_VALUE;
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** `Wed 30 Sep 2026, 14:05` (SAST). */
export function formatSastDateTime(iso: string | Date | null | undefined): string {
  const p = iso ? sastParts(iso) : null;
  if (!p) return EMPTY_VALUE;
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Build an ISO instant from SAST wall-clock input (e.g. a date + time picker):
 * `("2026-10-05", "09:30")` → `"2026-10-05T09:30:00+02:00"`.
 *
 * The device timezone is never consulted — a picker value means Johannesburg
 * time. Accepts `HH:mm` or `HH:mm:ss`. Returns null for anything that isn't a
 * real calendar date/time (e.g. `2026-02-30`, `25:00`), so forms can show a
 * field error instead of sending a bad instant. Output satisfies
 * `z.string().datetime({ offset: true })` (the MeetingInput contract).
 */
export function sastWallClockToIso(date: string, time: string): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? "").trim());
  const tm = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(time ?? "").trim());
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi, s] = [Number(tm[1]), Number(tm[2]), Number(tm[3] ?? "0")];
  if (mo < 1 || mo > 12 || d < 1 || h > 23 || mi > 59 || s > 59) return null;
  // Reject impossible dates (Feb 30 etc.) with a UTC round-trip — no local tz involved.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return `${dm[1]}-${dm[2]}-${dm[3]}T${tm[1]}:${tm[2]}:${pad2(s)}${SAST_OFFSET}`;
}

/** Inverse of `sastWallClockToIso`, for prefilling pickers: `{ date: "2026-10-05", time: "09:30" }`. */
export function isoToSastWallClock(iso: string | Date | null | undefined): { date: string; time: string } | null {
  const p = iso ? sastParts(iso) : null;
  if (!p) return null;
  return { date: `${p.year}-${pad2(p.month)}-${pad2(p.day)}`, time: `${pad2(p.hour)}:${pad2(p.minute)}` };
}

/** Today's date in Johannesburg as `YYYY-MM-DD` (default for date pickers). */
export function sastToday(now: Date = new Date()): string {
  return isoToSastWallClock(now)!.date;
}

/**
 * `[from, to)` ISO instants covering one SAST calendar day — for
 * `api.meetings.list({ from, to })`. Pure arithmetic on the fixed offset.
 */
export function sastDayRange(date: string): { from: string; to: string } | null {
  const from = sastWallClockToIso(date, "00:00");
  if (!from) return null;
  const next = new Date(new Date(from).getTime() + 24 * 60 * 60 * 1000 + SAST_OFFSET_MS);
  const nextDate = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
  return { from, to: sastWallClockToIso(nextDate, "00:00")! };
}
