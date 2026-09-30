import twilio from "twilio";
import type VoiceResponseNs from "twilio/lib/twiml/VoiceResponse";
import type { ConsultantConfig } from "../config";
import type { CallStatus } from "../types";
import { TWILIO } from "./constants";

/**
 * Twilio voice protocol for the Consultant Portal (3.1 lens: correct webhook semantics).
 *
 * Attribute names are checked against the installed `twilio@6` typings
 * (`lib/twiml/VoiceResponse.d.ts`: TranscriptionAttributes, DialAttributes, NumberAttributes).
 * Every callback URL is absolute from `cfg.publicUrl` and carries only the opaque `callId`.
 */

const { VoiceResponse } = twilio.twiml;
type SayVoice = NonNullable<VoiceResponseNs.SayAttributes["voice"]>;

export const VOICE_PATHS = {
  twiml: "/api/consultant-voice/twiml",
  whisper: "/api/consultant-voice/whisper",
  status: "/api/consultant-voice/status",
  dialComplete: "/api/consultant-voice/dial-complete",
  recording: "/api/consultant-voice/recording",
  transcription: "/api/consultant-voice/transcription",
} as const;

export function voiceUrl(cfg: Pick<ConsultantConfig, "publicUrl">, path: string, callId?: string): string {
  const url = `${cfg.publicUrl}${path}`;
  return callId ? `${url}?callId=${encodeURIComponent(callId)}` : url;
}

/**
 * The TwiML that bridges the consultant's browser leg to the clinic (SPEC step 3):
 * real-time transcription of both tracks on the parent leg, a dual-channel recording from
 * answer, and a whisper URL that plays the POPIA recording notice to the clinic only.
 */
export function buildDialTwiml(cfg: ConsultantConfig, input: { callId: string; to: string }): string {
  const vr = new VoiceResponse();
  vr.start().transcription({
    statusCallbackUrl: voiceUrl(cfg, VOICE_PATHS.transcription, input.callId),
    statusCallbackMethod: "POST",
    track: "both_tracks",
    languageCode: cfg.twilio.transcriptionLanguage,
    partialResults: false,
  });
  const dial = vr.dial({
    callerId: cfg.twilio.callerId,
    record: "record-from-answer-dual",
    recordingStatusCallback: voiceUrl(cfg, VOICE_PATHS.recording, input.callId),
    recordingStatusCallbackMethod: "POST",
    recordingStatusCallbackEvent: ["completed", "absent"],
    timeLimit: cfg.twilio.maxCallSec,
    timeout: cfg.twilio.dialTimeoutSec,
    action: voiceUrl(cfg, VOICE_PATHS.dialComplete, input.callId),
    method: "POST",
    // The browser leg stays "ringing" until the clinic answers, so the Voice SDK's
    // "accept" (and the call timer) fire on a real answer, not when Twilio starts dialling.
    answerOnBridge: true,
  });
  dial.number(
    {
      url: voiceUrl(cfg, VOICE_PATHS.whisper),
      method: "POST",
      statusCallback: voiceUrl(cfg, VOICE_PATHS.status, input.callId),
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
      statusCallbackMethod: "POST",
    },
    input.to,
  );
  return vr.toString();
}

/** Played on the clinic's leg after answer, before bridging — the consultant never hears it. */
export function buildWhisperTwiml(cfg: ConsultantConfig): string {
  const vr = new VoiceResponse();
  vr.say({ voice: cfg.recording.noticeVoice as SayVoice }, cfg.recording.notice);
  return vr.toString();
}

/** Refuse to place a call: a short spoken reason, then hang up. */
export function buildRefusalTwiml(cfg: ConsultantConfig, message: string): string {
  const vr = new VoiceResponse();
  vr.say({ voice: cfg.recording.noticeVoice as SayVoice }, message);
  vr.hangup();
  return vr.toString();
}

/** The Dial `action` response: the bridged call is over, end the browser leg. */
export function buildHangupTwiml(): string {
  const vr = new VoiceResponse();
  vr.hangup();
  return vr.toString();
}

export function emptyTwiml(): string {
  return new VoiceResponse().toString();
}

export function twimlResponse(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * Twilio call status (child-leg `CallStatus` or Dial `DialCallStatus`) → our collapsed CallStatus.
 * busy / no-answer / canceled are normal endings of a dial attempt → `completed` (the wrap-up
 * disposition says why); only a Twilio `failed` is a failed call.
 */
export function mapTwilioCallStatus(s: string | undefined | null): CallStatus | null {
  switch ((s ?? "").toLowerCase()) {
    case "queued":
    case "initiated":
      return "initiated";
    case "ringing":
      return "ringing";
    case "in-progress":
    case "answered":
      return "in_progress";
    case "completed":
    case "busy":
    case "no-answer":
    case "canceled":
      return "completed";
    case "failed":
      return "failed";
    default:
      return null;
  }
}

/** Callbacks can arrive out of order; a status only ever moves forward. */
export function statusRank(s: CallStatus): number {
  return { initiated: 0, ringing: 1, in_progress: 2, completed: 3, failed: 3 }[s];
}

export function isFinalStatus(s: CallStatus): boolean {
  return statusRank(s) === 3;
}

const ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;
const RECORDING_SID = /^RE[0-9a-f]{32}$/i;

export function isRecordingSid(v: unknown): v is string {
  return typeof v === "string" && RECORDING_SID.test(v);
}

/**
 * Fetch a recording's MP3 from Twilio with the account credentials (server-side only) and
 * return the upstream response. Forwards a single `Range` header so the browser can seek.
 * Returns null when Twilio isn't configured or the sid is malformed.
 */
export async function fetchRecording(
  cfg: ConsultantConfig,
  recordingSid: string,
  range: string | null,
): Promise<Response | null> {
  const { accountSid, authToken } = cfg.twilio;
  if (!ACCOUNT_SID.test(accountSid) || !authToken || !isRecordingSid(recordingSid)) return null;
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
  };
  if (range && /^bytes=\d*-\d*$/.test(range.trim())) headers.Range = range.trim();
  return fetch(`${TWILIO.apiBase}/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`, {
    headers,
    cache: "no-store",
  });
}

/**
 * Retention: DELETE the Recording resource on Twilio. true when it is gone (204, or 404
 * because it was already deleted); false on any other outcome so the sweep retries later.
 */
export async function deleteRecording(cfg: ConsultantConfig, recordingSid: string): Promise<boolean> {
  const { accountSid, authToken } = cfg.twilio;
  if (!ACCOUNT_SID.test(accountSid) || !authToken || !isRecordingSid(recordingSid)) return false;
  const res = await fetch(`${TWILIO.apiBase}/Accounts/${accountSid}/Recordings/${recordingSid}.json`, {
    method: "DELETE",
    headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}` },
    cache: "no-store",
  });
  return res.status === 204 || res.status === 404;
}
