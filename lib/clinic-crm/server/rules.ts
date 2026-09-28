import { createHash, timingSafeEqual } from "node:crypto";
import type { AutomationKind, Channel } from "../types";
import { CRM_CONFIG } from "./config";

/**
 * Pure business rules — no I/O, no clock unless passed in. Everything with a
 * decision in it lives here so it can be unit-tested without a database.
 */

// ── Templates ───────────────────────────────────────────────────────────────

export type TemplateVars = Record<string, string | undefined>;

/** Replaces {{name}} placeholders; unknown placeholders render as empty and whitespace is tidied. */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template
    .replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?])/g, "$1")
    .trim();
}

/** Positional Content API variables ({"1": …, "2": …}) from our named vars. */
export function contentVariables(vars: TemplateVars): Record<string, string> {
  const out: Record<string, string> = {};
  CRM_CONFIG.whatsapp.templateVariableOrder.forEach((name, i) => {
    out[String(i + 1)] = vars[name] ?? "";
  });
  return out;
}

/** The greeting name: a placeholder lead name never gets used as "Hi New enquiry". */
export function greetingName(firstName: string): string {
  const f = firstName.trim();
  return !f || f === CRM_CONFIG.inbound.unknownContactName ? CRM_CONFIG.inbound.greetingFallback : f;
}

export function formatAppointmentTime(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(CRM_CONFIG.timeFormat.locale, { ...CRM_CONFIG.timeFormat.options, timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat(CRM_CONFIG.timeFormat.locale, CRM_CONFIG.timeFormat.options).format(at);
  }
}

// ── Outbox dedupe keys ──────────────────────────────────────────────────────
// A key identifies "this message, for this fact". A reschedule changes the fact
// (starts_at), so it gets a new key and the stale one is cancelled.

export function reminderKey(appointmentId: string, startsAt: string | Date): string {
  return `reminder:${appointmentId}:${new Date(startsAt).toISOString()}`;
}
export function reminderKeyPrefix(appointmentId: string): string {
  return `reminder:${appointmentId}:`;
}
export function noShowKey(appointmentId: string): string {
  return `no_show:${appointmentId}`;
}
export function recallKey(patientId: string, lastAttendedAppointmentId: string): string {
  return `recall:${patientId}:${lastAttendedAppointmentId}`;
}
export function newLeadAckKey(patientId: string): string {
  return `new_lead_ack:${patientId}`;
}

export type ParsedKey =
  | { kind: "appointment_reminder"; appointmentId: string; startsAt: string }
  | { kind: "no_show_followup"; appointmentId: string }
  | { kind: "recall"; patientId: string; appointmentId: string }
  | { kind: "new_lead_ack"; patientId: string };

export function parseDedupeKey(key: string): ParsedKey | null {
  const i = key.indexOf(":");
  if (i < 0) return null;
  const prefix = key.slice(0, i);
  const rest = key.slice(i + 1);
  switch (prefix) {
    case "reminder": {
      const j = rest.indexOf(":");
      if (j < 0) return null;
      const startsAt = rest.slice(j + 1);
      if (Number.isNaN(Date.parse(startsAt))) return null;
      return { kind: "appointment_reminder", appointmentId: rest.slice(0, j), startsAt };
    }
    case "no_show":
      return rest ? { kind: "no_show_followup", appointmentId: rest } : null;
    case "recall": {
      const [patientId, appointmentId] = rest.split(":");
      return patientId && appointmentId ? { kind: "recall", patientId, appointmentId } : null;
    }
    case "new_lead_ack":
      return rest ? { kind: "new_lead_ack", patientId: rest } : null;
    default:
      return null;
  }
}

/** Reminder due time, or null if the appointment is too close (or past) to be worth reminding. */
export function reminderDueAt(startsAt: Date, offsetHours: number, now: Date): Date | null {
  const minLeadMs = CRM_CONFIG.outbox.reminderMinLeadMinutes * 60_000;
  if (startsAt.getTime() - now.getTime() < minLeadMs) return null;
  const due = new Date(startsAt.getTime() - offsetHours * 3_600_000);
  return due < now ? now : due;
}

// ── Retry ───────────────────────────────────────────────────────────────────

/** Exponential backoff after the given (1-based) attempt, capped. */
export function backoffMs(attempt: number): number {
  const { retryBaseSeconds, retryMaxSeconds } = CRM_CONFIG.outbox;
  const s = Math.min(retryMaxSeconds, retryBaseSeconds * 2 ** Math.max(0, attempt - 1));
  return s * 1000;
}

// ── Opt-out keywords ────────────────────────────────────────────────────────

export function detectOptKeyword(body: string): "stop" | "start" | null {
  const norm = body
    .trim()
    .toUpperCase()
    .replace(/[\s]+/g, " ")
    .replace(/^[^A-Z]+|[^A-Z]+$/g, "");
  if ((CRM_CONFIG.inbound.stopKeywords as readonly string[]).includes(norm)) return "stop";
  if ((CRM_CONFIG.inbound.startKeywords as readonly string[]).includes(norm)) return "start";
  return null;
}

// ── Delivery status ordering ────────────────────────────────────────────────
// Twilio callbacks can arrive out of order or be retried; a later callback must
// never move a message backwards (e.g. "sent" arriving after "delivered").

const STATUS_RANK: Record<string, number> = {
  accepted: 0,
  scheduled: 0,
  queued: 0,
  sending: 1,
  sent: 2,
  failed: 3,
  undelivered: 3,
  canceled: 3,
  delivered: 3,
  read: 4,
};

export function isKnownOutboundStatus(s: string): boolean {
  return s in STATUS_RANK;
}

export function shouldApplyStatus(current: string, next: string): boolean {
  if (!(next in STATUS_RANK)) return false;
  if (!(current in STATUS_RANK)) return false; // e.g. inbound "received" — never touched
  return STATUS_RANK[next] > STATUS_RANK[current];
}

/** Statuses a row may currently hold for `next` to be applied (used as a race-safe SQL guard). */
export function statusesBelow(next: string): string[] {
  if (!(next in STATUS_RANK)) return [];
  return Object.keys(STATUS_RANK).filter((s) => STATUS_RANK[s] < STATUS_RANK[next]);
}

// ── Channel selection ───────────────────────────────────────────────────────

export interface ChannelInput {
  requested: Channel;
  optedOut: boolean;
  /** clinics.whatsapp_from ('' when not configured). */
  whatsappFrom: string;
  /** clinics.sms_from ('' when not configured). */
  smsFrom: string;
  /** Last inbound WhatsApp message was within the service window. */
  windowOpen: boolean;
  /** Approved Content template for this automation ('' for none / manual sends). */
  contentSid: string;
  /** Automations may switch channel; a staff member's explicit choice is honoured or refused. */
  allowFallback: boolean;
}

export type SkipReason =
  | "opted_out"
  | "whatsapp_window_closed"
  | "whatsapp_not_configured"
  | "sms_not_configured"
  | "no_sender";

export type ChannelDecision =
  | { ok: true; channel: Channel; from: string; contentSid: string | null }
  | { ok: false; reason: SkipReason };

export function decideChannel(i: ChannelInput): ChannelDecision {
  if (i.optedOut) return { ok: false, reason: "opted_out" };
  const sms = (): ChannelDecision | null => (i.smsFrom ? { ok: true, channel: "sms", from: i.smsFrom, contentSid: null } : null);

  const whatsapp = (): ChannelDecision | null => {
    if (!i.whatsappFrom) return null;
    if (i.windowOpen) return { ok: true, channel: "whatsapp", from: i.whatsappFrom, contentSid: null };
    if (i.contentSid) return { ok: true, channel: "whatsapp", from: i.whatsappFrom, contentSid: i.contentSid };
    return null;
  };

  if (i.requested === "whatsapp") {
    const wa = whatsapp();
    if (wa) return wa;
    if (i.allowFallback) {
      const s = sms();
      if (s) return s;
    }
    if (!i.whatsappFrom) return { ok: false, reason: i.allowFallback ? "no_sender" : "whatsapp_not_configured" };
    return { ok: false, reason: "whatsapp_window_closed" };
  }

  const s = sms();
  if (s) return s;
  if (i.allowFallback) {
    const wa = whatsapp();
    if (wa) return wa;
    return { ok: false, reason: i.whatsappFrom ? "whatsapp_window_closed" : "no_sender" };
  }
  return { ok: false, reason: "sms_not_configured" };
}

export function windowOpen(lastInboundWhatsapp: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundWhatsapp) return false;
  const t = new Date(lastInboundWhatsapp).getTime();
  return now.getTime() - t < CRM_CONFIG.whatsapp.serviceWindowHours * 3_600_000;
}

// ── Misc ────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string | null | undefined): s is string {
  return !!s && UUID_RE.test(s);
}

/**
 * Digits to suffix-match against stored E.164 numbers: "082 123 4567" and "+27 82 123 4567"
 * both reduce to a suffix of "27821234567". Null when there aren't enough digits to search on.
 */
export function phoneSearchDigits(q: string): string | null {
  let d = q.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  return d.length >= CRM_CONFIG.api.minPhoneSearchDigits ? d : null;
}

/** Escapes LIKE/ILIKE wildcards in user search text. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Constant-time compare (hashing first so neither length nor content leaks through timing). */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function iso(d: Date | string): string;
export function iso(d: Date | string | null | undefined): string | null;
export function iso(d: Date | string | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  return (d instanceof Date ? d : new Date(d)).toISOString();
}
