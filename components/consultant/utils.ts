import { formatZar } from "../../lib/consultant/client/format";
import { SAST_TIME_ZONE, type CallDisposition, type NepqStage } from "../../lib/consultant/types";

/** Join truthy class names. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** One focus treatment everywhere: visible, accent, never removed. */
export const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--cp-accent]";

export const DISPOSITION_LABELS: Record<CallDisposition, string> = {
  no_answer: "No answer",
  voicemail: "Voicemail",
  gatekeeper: "Gatekeeper",
  callback: "Call back",
  not_interested: "Not interested",
  discovery_booked: "Discovery booked",
  demo_booked: "Demo booked",
  wrong_number: "Wrong number",
};

export const NEPQ_LABELS: Record<NepqStage, string> = {
  connection: "Connection",
  situation: "Situation",
  problem_awareness: "Problem",
  solution_awareness: "Solution",
  consequence: "Consequence",
  qualifying: "Qualifying",
  transition: "Transition",
  commitment: "Commitment",
};

/** 75 → "1:15", 3725 → "1:02:05". */
export function fmtClock(totalSec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(totalSec ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return `${h ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

/** 4320 → "1h 12m", 840 → "14m", 20 → "<1m". */
export function fmtTalkTime(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  if (m < 1) return totalSec > 0 ? "<1m" : "0m";
  const h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m`;
}

// Every date/time in the portal is SAST, whatever timezone the device is set to.
const dtf = () =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: SAST_TIME_ZONE, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const df = () => new Intl.DateTimeFormat("en-ZA", { timeZone: SAST_TIME_ZONE, day: "numeric", month: "short" });
const tf = () => new Intl.DateTimeFormat("en-ZA", { timeZone: SAST_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : dtf().format(d);
}

/** Start of the SAST calendar day containing `d` (SAST is UTC+2 all year — no DST). */
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000;
function startOfDay(d: Date): number {
  return Math.floor((d.getTime() + SAST_OFFSET_MS) / 86_400_000) * 86_400_000 - SAST_OFFSET_MS;
}

/** "Just now", "12m ago", "3h ago", "Yesterday", "4d ago", then a date. */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24 && startOfDay(new Date(t)) === startOfDay(new Date(now))) return `${h}h ago`;
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(new Date(t))) / 86_400_000);
  if (days <= 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return df().format(new Date(t));
}

/** Due label for a next action: "Overdue · 2d", "Today 14:00", "Tomorrow 09:00", "3 Oct". */
export function fmtDue(iso: string | null | undefined, now = Date.now()): { label: string; overdue: boolean } | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dayDiff = Math.round((startOfDay(d) - startOfDay(new Date(now))) / 86_400_000);
  if (d.getTime() < now) {
    return { label: dayDiff === 0 ? `Overdue · ${tf().format(d)}` : `Overdue · ${Math.abs(dayDiff)}d`, overdue: true };
  }
  if (dayDiff === 0) return { label: `Today ${tf().format(d)}`, overdue: false };
  if (dayDiff === 1) return { label: `Tomorrow ${tf().format(d)}`, overdue: false };
  return { label: df().format(d), overdue: false };
}

/** ISO → value for <input type="datetime-local"> in the user's local time. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value → ISO (UTC, accepted by the zod `datetime({offset:true})`). */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Null-preserving wrapper over Agent 2's `formatZar` (`R12 500`). */
export function fmtZar(n: number | null | undefined): string | null {
  if (n == null) return null;
  return formatZar(n);
}

/** Status + message of anything thrown by the API client, without importing it. */
function statusOf(e: unknown): number | null {
  if (e && typeof e === "object" && "status" in e && typeof (e as { status: unknown }).status === "number") {
    return (e as { status: number }).status;
  }
  return null;
}

/**
 * The user-facing message for an error. The API client already makes messages
 * user-safe; this only adds context for the cases we design specifically.
 */
export function describeError(e: unknown, context?: "call" | "load" | "save"): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  const status = statusOf(e);
  if (context === "call") {
    if (status === 503) return "Calling isn't set up yet — ask an admin.";
    if (status === 409) return "You already have a live call. Finish it first.";
    if (status === 429) return "Too many call attempts. Wait a minute and try again.";
    const msg = e instanceof Error ? e.message : "";
    if (/microphone|permission|notallowed/i.test(msg)) {
      return "Microphone access is blocked. Allow the mic for this site in your browser settings, then try again.";
    }
  }
  if (status === 0) return "You're offline or the connection dropped. Check your signal and try again.";
  if (e instanceof Error && e.message) return e.message;
  return context === "save" ? "Couldn't save. Try again." : "Something went wrong. Try again.";
}

export function errorStatus(e: unknown): number | null {
  return statusOf(e);
}

export function errorFields(e: unknown): Record<string, string> | undefined {
  if (e && typeof e === "object" && "fields" in e) {
    const f = (e as { fields?: unknown }).fields;
    if (f && typeof f === "object") return f as Record<string, string>;
  }
  return undefined;
}

/** Count of anything the outbox reports as pending (a number or a list). */
export function countOf(x: unknown): number {
  if (typeof x === "number") return x;
  if (Array.isArray(x)) return x.length;
  return 0;
}

/** RFC4122 v4 id for idempotent offline creates. */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
