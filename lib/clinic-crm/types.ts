import { z } from "zod";

/**
 * The single contract between the Clinic CRM front end and its API.
 *
 * Every request body is parsed with these schemas on the server, and the same
 * schemas drive client-side validation, so the two can never disagree about
 * what a valid patient, appointment or goal looks like.
 */

export const STAFF_ROLES = ["owner", "manager", "reception"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const CHANNELS = ["whatsapp", "sms"] as const;
export type Channel = (typeof CHANNELS)[number];

export const APPOINTMENT_STATUSES = ["booked", "confirmed", "attended", "no_show", "cancelled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const LEAD_STAGES = ["new", "contacted", "booked", "lost"] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const AUTOMATION_KINDS = [
  "appointment_reminder", // N hours before starts_at
  "no_show_followup", // after status → no_show
  "new_lead_ack", // instant reply to a first inbound message
  "recall", // N days after last attended visit
] as const;
export type AutomationKind = (typeof AUTOMATION_KINDS)[number];

export const GOAL_METRICS = ["no_show_rate", "speed_to_lead_min", "bookings", "revenue", "custom"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

/** E.164 after normalisation; ZA local numbers (0XXXXXXXXX) are accepted and converted. */
export function normalizeE164(input: string): string | null {
  let s = input.trim().replace(/^whatsapp:/i, "").replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (/^0\d{9}$/.test(s)) s = "+27" + s.slice(1);
  if (!s.startsWith("+") && /^\d{10,15}$/.test(s)) s = "+" + s;
  return /^\+\d{8,15}$/.test(s) ? s : null;
}

const phone = z
  .string()
  .trim()
  .max(32)
  .transform((v, ctx) => {
    const n = normalizeE164(v);
    if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid mobile number" });
    return n ?? v;
  });

const name = z.string().trim().min(1).max(80);

// ── Inputs ──────────────────────────────────────────────────────────────────

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  password: z.string().min(1).max(200),
});

export const PatientInput = z.object({
  firstName: name,
  lastName: z.string().trim().max(80).default(""),
  phone,
  email: z.string().trim().toLowerCase().email().max(160).optional().or(z.literal("")),
  preferredChannel: z.enum(CHANNELS).default("whatsapp"),
  /** POPIA: processing requires consent; it is recorded with who captured it and when. */
  consent: z.literal(true, { errorMap: () => ({ message: "Patient consent is required" }) }),
  notes: z.string().trim().max(4000).default(""),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
});
export type PatientInput = z.infer<typeof PatientInput>;
export const PatientPatch = PatientInput.omit({ consent: true }).partial().extend({
  leadStage: z.enum(LEAD_STAGES).nullable().optional(),
  /** Converting an enquiry into a registered patient records consent at that moment. */
  consent: z.literal(true).optional(),
});

export const AppointmentInput = z.object({
  patientId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  durationMin: z.number().int().min(5).max(480).default(30),
  practitioner: z.string().trim().max(80).default(""),
  service: z.string().trim().max(80).default(""),
});
export const AppointmentPatch = z.object({
  startsAt: z.string().datetime({ offset: true }).optional(),
  durationMin: z.number().int().min(5).max(480).optional(),
  practitioner: z.string().trim().max(80).optional(),
  service: z.string().trim().max(80).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
});

export const SendMessageInput = z.object({
  patientId: z.string().uuid(),
  body: z.string().trim().min(1).max(1600),
  channel: z.enum(CHANNELS).optional(), // defaults to the patient's preferred channel
});

export const AutomationPatch = z.object({
  enabled: z.boolean().optional(),
  /** Hours before (reminder) / after (no-show) / days after (recall). */
  offset: z.number().int().min(0).max(24 * 60).optional(),
  body: z.string().trim().min(1).max(1000).optional(),
  /** Approved WhatsApp Content template SID — required for business-initiated WhatsApp. */
  contentSid: z.string().trim().regex(/^HX[0-9a-f]{32}$/i).optional().or(z.literal("")),
});

export const GoalInput = z.object({
  title: z.string().trim().min(1).max(120),
  metric: z.enum(GOAL_METRICS).default("custom"),
  target: z.number().finite().nullable().default(null),
  dueOn: z.string().date().nullable().default(null),
  color: z.enum(["blue", "amber", "green", "rose", "violet"]).default("blue"),
  x: z.number().finite().min(0).max(4000).default(40),
  y: z.number().finite().min(0).max(4000).default(40),
});
export const GoalPatch = GoalInput.partial().extend({
  done: z.boolean().optional(),
  progress: z.number().finite().nullable().optional(),
});

/** Cross-device continuity: a small JSON blob per staff member per key (drafts, filters, open panels). */
export const StateKey = z.string().regex(/^[a-z0-9:_-]{1,64}$/);
export const StateValue = z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 16_384, "State too large");

// ── Outputs ─────────────────────────────────────────────────────────────────

export interface Session {
  staffId: string;
  clinicId: string;
  role: StaffRole;
  name: string;
  clinicName: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  preferredChannel: Channel;
  /** Null for a contact created by an inbound message who has not yet been registered as a patient. */
  consentAt: string | null;
  /** Non-null while this contact is still an enquiry rather than a registered patient. */
  leadStage: LeadStage | null;
  optedOutAt: string | null;
  notes: string;
  tags: string[];
  createdAt: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  startsAt: string;
  durationMin: number;
  practitioner: string;
  service: string;
  status: AppointmentStatus;
}

export interface Message {
  id: string;
  patientId: string;
  direction: "in" | "out";
  channel: Channel;
  body: string;
  status: string; // queued | sent | delivered | read | failed | received
  createdAt: string;
  automation: AutomationKind | null;
}

export interface Conversation {
  patientId: string;
  patientName: string;
  lastMessage: string;
  lastAt: string;
  unread: number;
  /** WhatsApp free-form replies are only allowed within 24h of the patient's last inbound. */
  windowOpen: boolean;
}

export interface Automation {
  id: string;
  kind: AutomationKind;
  enabled: boolean;
  offset: number;
  body: string;
  contentSid: string;
}

export interface Goal {
  id: string;
  title: string;
  metric: GoalMetric;
  target: number | null;
  progress: number | null;
  dueOn: string | null;
  color: "blue" | "amber" | "green" | "rose" | "violet";
  x: number;
  y: number;
  done: boolean;
}

export interface Dashboard {
  today: Appointment[];
  unreadConversations: number;
  /** Median minutes from first inbound to first human/automated reply, last 30 days. */
  speedToLeadMin: number | null;
  /** no_show / (attended + no_show), last 30 days. */
  noShowRate: number | null;
  remindersSent30d: number;
  openLeads: number;
}

/** Every API error has this shape; never a raw driver message. */
export interface ApiError {
  error: string;
  fields?: Record<string, string>;
}
