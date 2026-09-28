import type { AutomationKind } from "../types";

/**
 * Every tunable the Clinic CRM back end uses — timings, limits, keywords, copy.
 * Nothing numeric or user-facing is inlined in the process/experience layers.
 */
export const CRM_CONFIG = {
  whatsapp: {
    /** Meta's customer-service window: free-form replies allowed this long after the last inbound. */
    serviceWindowHours: 24,
    /**
     * Content template variables are positional ("1", "2", …). This is the order
     * our named placeholders map onto them when an automation sends a template.
     */
    templateVariableOrder: ["firstName", "clinicName", "time"] as const,
  },
  outbox: {
    /** Rows claimed per drain batch. */
    batchSize: 25,
    /** A claimed row is invisible to other drains for this long (crash safety: it becomes due again). */
    leaseSeconds: 120,
    /** Total attempts (including the first) before a row is marked failed. */
    maxAttempts: 5,
    retryBaseSeconds: 60,
    retryMaxSeconds: 60 * 60,
    /** Wall-clock budget for one cron drain, leaving headroom under the function timeout. */
    drainBudgetMs: 20_000,
    /** Don't send a reminder when the appointment starts sooner than this. */
    reminderMinLeadMinutes: 60,
    /** Backstop enqueue only looks this far back, so enabling an automation never blasts history. */
    noShowLookbackDays: 7,
    recallLookbackDays: 30,
  },
  twilio: {
    apiBase: "https://api.twilio.com/2010-04-01",
    timeoutMs: 10_000,
  },
  inbound: {
    /** Case-insensitive, whole-message match after trimming punctuation/whitespace. */
    stopKeywords: ["STOP", "STOPALL", "UNSUBSCRIBE", "OPT OUT", "OPTOUT"],
    startKeywords: ["START", "UNSTOP"],
    stopConfirmation:
      "You've been unsubscribed from {{clinicName}} messages and won't hear from us again. Reply START to opt back in.",
    /** Name stored for a contact who messages in before they're registered. */
    unknownContactName: "New enquiry",
    /** What {{firstName}} renders as when we don't know the person's name. */
    greetingFallback: "there",
    mediaPlaceholder: "[attachment]",
  },
  api: {
    maxPatients: 200,
    maxSearchResults: 50,
    /** Digits needed before a search also matches on phone-number suffix. */
    minPhoneSearchDigits: 3,
    maxConversations: 200,
    maxThreadMessages: 500,
    /** Default and maximum span for GET appointments. */
    appointmentsDefaultDaysBack: 1,
    appointmentsDefaultDaysAhead: 30,
    appointmentsMaxRangeDays: 93,
    /** Manual sends per staff member per minute. */
    sendRateLimit: 30,
    sendRateWindowMs: 60_000,
  },
  metrics: {
    windowDays: 30,
  },
  /** Rendering of {{time}} in messages, in the clinic's own time zone. */
  timeFormat: {
    locale: "en-ZA",
    options: { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false } as Intl.DateTimeFormatOptions,
  },
} as const;

export interface AutomationDefault {
  kind: AutomationKind;
  enabled: boolean;
  /** reminder: hours before · no_show: hours after · recall: days after last visit · new_lead_ack: unused (instant). */
  offset: number;
  body: string;
}

/**
 * The four automations every clinic starts with — all DISABLED until the practice
 * reviews the wording (and, for WhatsApp, attaches an approved Content template).
 */
export const AUTOMATION_DEFAULTS: Record<AutomationKind, AutomationDefault> = {
  appointment_reminder: {
    kind: "appointment_reminder",
    enabled: false,
    offset: 24,
    body:
      "Hi {{firstName}}, just a friendly reminder of your appointment at {{clinicName}} on {{time}}. " +
      "If you need to reschedule, simply reply to this message. Reply STOP to opt out.",
  },
  no_show_followup: {
    kind: "no_show_followup",
    enabled: false,
    offset: 2,
    body:
      "Hi {{firstName}}, we missed you at {{clinicName}} today. No stress — reply here and we'll " +
      "find you a new time that suits you. Reply STOP to opt out.",
  },
  new_lead_ack: {
    kind: "new_lead_ack",
    enabled: false,
    offset: 0,
    body:
      "Hi {{firstName}}, thanks for getting in touch with {{clinicName}}! We've received your message " +
      "and one of our team will get back to you shortly.",
  },
  recall: {
    kind: "recall",
    enabled: false,
    offset: 180,
    body:
      "Hi {{firstName}}, it's been a while since your last visit to {{clinicName}} and you're due for a " +
      "check-up. Reply here and we'll book a time that works for you. Reply STOP to opt out.",
  },
};

/** Public origin Twilio calls us on (signature validation + status callbacks). Vercel's req.url host can differ. */
export function publicBaseUrl(): string {
  return (process.env.CLINIC_CRM_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
}

export const API_PREFIX = "/api/clinic-crm";
