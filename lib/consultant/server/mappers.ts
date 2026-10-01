import type { ConsultantConfig } from "../config";
import {
  CALL_DISPOSITIONS,
  CALL_STATUSES,
  CLINICS_VERTICAL,
  NOTE_KINDS,
  SALES_STAGES,
  SOCIAL_PLATFORMS,
  SPEAKERS,
  SUMMARY_STATUSES,
  type Call,
  type CallDisposition,
  type CallStatus,
  type CallSummary,
  type Lead,
  type Note,
  type NoteKind,
  type NoteRevision,
  type SalesStage,
  type SocialPlatform,
  type Speaker,
  type SummaryStatus,
  type TranscriptSegment,
} from "../types";
import { CRM_FEED } from "./constants";
import { dealHealth } from "./health";
import { iso } from "./util";

/** Pure row → contract mappers. Rows come from the SELECTs in `repo/*.ts`. */

function oneOf<T extends string>(values: readonly T[], v: unknown, fallback: T): T {
  return (values as readonly string[]).includes(String(v)) ? (v as T) : fallback;
}

function oneOfOrNull<T extends string>(values: readonly T[], v: unknown): T | null {
  return (values as readonly string[]).includes(String(v)) ? (v as T) : null;
}

const str = (v: unknown): string | null => (v == null ? null : String(v));
const num = (v: unknown): number | null => (v == null || v === "" ? null : Number(v));

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${CRM_FEED.placeholderEmailDomain}`);
}

export type LeadRow = {
  id: string;
  clinic_name: string;
  contact_name: string | null;
  contact_role: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  city: string | null;
  lead_source: string | null;
  /** Wave 2 lead provenance (referral / social inbound). Optional so older SELECTs still map. */
  referred_by?: string | null;
  social_platform?: string | null;
  social_handle?: string | null;
  /** Public-domain provenance (POPIA s.18: where we found the clinic's details). */
  source_url?: string | null;
  sourced_at?: Date | string | null;
  sales_stage: string | null;
  sales_stage_changed_at: Date | string | null;
  lost_reason: string | null;
  next_action: string | null;
  next_action_at: Date | string | null;
  deal_value: number | string | null;
  consultant_id: string | null;
  consultant_name: string | null;
  last_call_at: Date | string | null;
  call_count: number | string | null;
  created_at: Date | string;
};

export function toLead(r: LeadRow, pipeline: ConsultantConfig["pipeline"], now: Date = new Date()): Lead {
  const stage: SalesStage = oneOf(SALES_STAGES, r.sales_stage, "new");
  const createdAt = iso(r.created_at) ?? new Date(0).toISOString();
  const stageChangedAt = iso(r.sales_stage_changed_at) ?? createdAt;
  const lastCallAt = iso(r.last_call_at);
  const lastTouch = [stageChangedAt, lastCallAt, createdAt]
    .filter((v): v is string => !!v)
    .sort()
    .pop() ?? null;
  return {
    id: r.id,
    clinicName: r.clinic_name,
    contactName: str(r.contact_name),
    contactRole: str(r.contact_role),
    phone: str(r.phone),
    email: isPlaceholderEmail(r.email) ? null : str(r.email),
    website: str(r.website_url),
    city: str(r.city),
    source: str(r.lead_source),
    referredBy: str(r.referred_by),
    socialPlatform: oneOfOrNull<SocialPlatform>(SOCIAL_PLATFORMS, r.social_platform),
    socialHandle: str(r.social_handle),
    sourceUrl: str(r.source_url),
    sourcedAt: iso(r.sourced_at),
    vertical: CLINICS_VERTICAL,
    salesStage: stage,
    salesStageChangedAt: stageChangedAt,
    lostReason: str(r.lost_reason),
    nextAction: str(r.next_action),
    nextActionAt: iso(r.next_action_at),
    dealValue: num(r.deal_value),
    consultantId: str(r.consultant_id),
    consultantName: str(r.consultant_name),
    health: dealHealth({ stage, lastTouchAt: lastTouch, nextActionAt: r.next_action_at }, pipeline, now),
    lastCallAt,
    callCount: Number(r.call_count ?? 0),
    createdAt,
  };
}

export type CallRow = {
  id: string;
  client_id: string;
  consultant_id: string;
  consultant_name: string | null;
  to_number: string;
  status: string;
  started_at: Date | string;
  answered_at: Date | string | null;
  ended_at: Date | string | null;
  duration_sec: number | null;
  recording_sid: string | null;
  disposition: string | null;
  next_action: string | null;
  next_action_at: Date | string | null;
  summary_status: string;
  summary: unknown;
};

export function toCall(r: CallRow): Call {
  return {
    id: r.id,
    leadId: r.client_id,
    consultantId: r.consultant_id,
    consultantName: str(r.consultant_name),
    toNumber: r.to_number,
    status: oneOf<CallStatus>(CALL_STATUSES, r.status, "initiated"),
    startedAt: iso(r.started_at) ?? new Date(0).toISOString(),
    answeredAt: iso(r.answered_at),
    endedAt: iso(r.ended_at),
    durationSec: num(r.duration_sec),
    hasRecording: !!r.recording_sid,
    disposition: oneOfOrNull<CallDisposition>(CALL_DISPOSITIONS, r.disposition),
    nextAction: str(r.next_action),
    nextActionAt: iso(r.next_action_at),
    summaryStatus: oneOf<SummaryStatus>(SUMMARY_STATUSES, r.summary_status, "pending"),
    summary: (r.summary && typeof r.summary === "object" ? r.summary : null) as CallSummary | null,
  };
}

export type NoteRow = {
  id: string;
  client_id: string;
  call_id: string | null;
  kind: string;
  body: string;
  version: number;
  created_by_name: string;
  created_at: Date | string;
  updated_by_name: string | null;
  updated_at: Date | string | null;
};

export function toNote(r: NoteRow): Note {
  return {
    id: r.id,
    leadId: r.client_id,
    callId: str(r.call_id),
    kind: oneOf<NoteKind>(NOTE_KINDS, r.kind, "manual"),
    body: r.body,
    version: Number(r.version),
    createdBy: r.created_by_name,
    createdAt: iso(r.created_at) ?? new Date(0).toISOString(),
    updatedBy: str(r.updated_by_name),
    updatedAt: iso(r.updated_at),
  };
}

export type RevisionRow = { version: number; body: string; edited_by_name: string; edited_at: Date | string };

export function toRevision(r: RevisionRow): NoteRevision {
  return {
    version: Number(r.version),
    body: r.body,
    editedBy: r.edited_by_name,
    editedAt: iso(r.edited_at) ?? new Date(0).toISOString(),
  };
}

export type SegmentRow = { seq: number; speaker: string; text: string; at: Date | string };

export function toSegment(r: SegmentRow): TranscriptSegment {
  return {
    seq: Number(r.seq),
    speaker: oneOf<Speaker>(SPEAKERS, r.speaker, "prospect"),
    text: r.text,
    at: iso(r.at) ?? new Date(0).toISOString(),
  };
}

export function isLiveStatus(status: CallStatus): boolean {
  return status === "initiated" || status === "ringing" || status === "in_progress";
}
