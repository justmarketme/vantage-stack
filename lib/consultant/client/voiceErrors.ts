/**
 * Turn anything that can go wrong while placing a browser call into one short,
 * actionable sentence. Pure — unit-tested. Never includes numbers or names.
 */

import { ApiClientError } from "./api";

export const VOICE_ERRORS = {
  micDenied:
    "Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.",
  micMissing: "No microphone was found. Plug in a headset or check your device's audio settings.",
  micBusy: "Your microphone is being used by another app. Close it and try again.",
  unsupported: "This browser can't make calls. Use the latest Chrome, Edge or Safari.",
  insecure: "Calling needs a secure (https) connection.",
  notConfigured: "Calling isn't set up yet. Ask an admin to finish the Twilio voice configuration.",
  sessionExpired: "Your session has expired. Sign in again to make calls.",
  forbidden: "Your account isn't allowed to place calls.",
  alreadyLive: "You already have a call in progress. End it before starting another.",
  rateLimited: "Too many call attempts. Wait a moment and try again.",
  offline: "You're offline. Calls need a data connection — try again when you have signal.",
  token: "The voice connection expired. Try the call again.",
  network: "The call dropped because the connection was lost.",
  declined: "The call couldn't be connected. Check the number on the lead and try again.",
  generic: "The call failed. Try again.",
} as const;

const TWILIO_CODES: Record<number, keyof typeof VOICE_ERRORS> = {
  31401: "micDenied", // UserMedia PermissionDeniedError
  31208: "micDenied", // Media: user denied access
  31402: "micMissing", // UserMedia AcquisitionFailedError
  31400: "micMissing",
  20101: "token", // AccessTokenInvalid
  20103: "token",
  20104: "token", // AccessTokenExpired
  20105: "token",
  31204: "token", // JWT invalid
  31205: "token", // JWT expired
  31207: "token",
  31201: "sessionExpired",
  31000: "network",
  31003: "network", // ICE failed
  31005: "network", // connection error
  31009: "network", // transport error
  53000: "network", // signalling
  53001: "network",
  53405: "network", // media connection failed
  31002: "declined",
  31486: "declined", // busy
  31480: "declined", // unavailable
  31603: "declined",
  31404: "declined",
};

export function voiceErrorKey(err: unknown): keyof typeof VOICE_ERRORS {
  if (err instanceof ApiClientError) {
    if (err.status === 0) return "offline";
    if (err.status === 401) return "sessionExpired";
    if (err.status === 403) return "forbidden";
    if (err.status === 409) return "alreadyLive";
    if (err.status === 429) return "rateLimited";
    if (err.status === 503 || err.status === 501) return "notConfigured";
    return "generic";
  }
  const e = err as { name?: unknown; code?: unknown; message?: unknown } | null | undefined;
  const name = typeof e?.name === "string" ? e.name : "";
  // getUserMedia DOMExceptions
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "micDenied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "micMissing";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "micBusy";
  if (name === "NotSupportedError") return "unsupported";
  // Twilio errors
  if (typeof e?.code === "number" && TWILIO_CODES[e.code]) return TWILIO_CODES[e.code];
  return "generic";
}

export function voiceErrorMessage(err: unknown): string {
  return VOICE_ERRORS[voiceErrorKey(err)];
}
