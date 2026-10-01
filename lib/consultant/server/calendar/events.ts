import type { MeetingKind } from "../../types";
import { isPlaceholderEmail } from "../mappers";
import { CALENDAR } from "./constants";
import { sastLabel } from "./sast";
import type { CalendarEventSpec } from "./types";

/**
 * Builds the provider-neutral event for a meeting. Pure; unit-tested.
 *
 * - Title: "<Kind> · <Clinic name>".
 * - Description: what the meeting is, its SAST time, and a link back to the lead workspace.
 *   It never carries phone numbers, the consultant's private meeting notes or transcript text —
 *   the clinic can see it when invited.
 * - Attendee: the clinic contact, only when the consultant ticked "invite" AND the lead has a
 *   real email (not the CRM's internal placeholder address).
 */

export type MeetingForEvent = {
  meetingId: string;
  kind: MeetingKind;
  startsAt: string;
  endsAt: string;
  inviteClinic: boolean;
  leadId: string;
  clinicName: string;
  contactName: string | null;
  /** Raw `clients.email` (may be a placeholder). */
  email: string | null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function inviteeFor(m: Pick<MeetingForEvent, "inviteClinic" | "email" | "contactName">): CalendarEventSpec["attendee"] {
  if (!m.inviteClinic || !m.email) return null;
  const email = m.email.trim().toLowerCase();
  if (isPlaceholderEmail(email) || !EMAIL.test(email)) return null;
  return { email, name: m.contactName?.trim() || null };
}

export function eventTitle(kind: MeetingKind, clinicName: string): string {
  return `${CALENDAR.kindLabels[kind]} · ${clinicName.trim()}`;
}

export function buildEventSpec(m: MeetingForEvent, publicUrl: string): CalendarEventSpec {
  const link = publicUrl ? `${publicUrl.replace(/\/+$/, "")}/consultant/leads/${m.leadId}` : null;
  const lines = [
    `${CALENDAR.kindLabels[m.kind]} with ${m.clinicName.trim()} — VantageStack Clinics.`,
    `When: ${sastLabel(m.startsAt)} (South African Standard Time).`,
  ];
  if (link) lines.push("", `Lead workspace (VantageStack team only): ${link}`);
  return {
    meetingId: m.meetingId,
    title: eventTitle(m.kind, m.clinicName),
    description: lines.join("\n"),
    startIso: m.startsAt,
    endIso: m.endsAt,
    attendee: inviteeFor(m),
  };
}
