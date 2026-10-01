import type { Speaker } from "../types";

/**
 * Twilio Real-Time Transcription webhook events (`<Start><Transcription>` statusCallbackUrl).
 *
 * `TranscriptionEvent` is one of transcription-started | transcription-content |
 * transcription-stopped | transcription-error. Content events carry `TranscriptionData`
 * (JSON `{ transcript, confidence }`), `Track` and `Final`. Transcription runs on the PARENT
 * (browser) leg, so `inbound_track` is audio coming from the consultant's browser and
 * `outbound_track` is audio Twilio sends to the browser — the clinic.
 */

export type TranscriptionEvent =
  | { kind: "content"; speaker: Speaker; text: string; at: Date }
  | { kind: "started" }
  | { kind: "stopped" }
  | { kind: "error" }
  | { kind: "ignored" };

export function speakerForTrack(track: string | undefined): Speaker | null {
  if (track === "inbound_track") return "consultant";
  if (track === "outbound_track") return "prospect";
  return null;
}

/** Pure: form params → the one thing we do with them. Partial (non-final) results are ignored. */
export function parseTranscriptionEvent(params: Record<string, string>, now: Date = new Date()): TranscriptionEvent {
  switch (params.TranscriptionEvent) {
    case "transcription-started":
      return { kind: "started" };
    case "transcription-stopped":
      return { kind: "stopped" };
    case "transcription-error":
      return { kind: "error" };
    case "transcription-content":
      break;
    default:
      return { kind: "ignored" };
  }
  if (String(params.Final).toLowerCase() !== "true") return { kind: "ignored" };
  const speaker = speakerForTrack(params.Track);
  if (!speaker) return { kind: "ignored" };

  let text = "";
  try {
    const data = JSON.parse(params.TranscriptionData ?? "") as { transcript?: unknown };
    text = typeof data?.transcript === "string" ? data.transcript.replace(/\s+/g, " ").trim() : "";
  } catch {
    return { kind: "ignored" };
  }
  if (!text) return { kind: "ignored" };

  const ts = params.Timestamp ? Date.parse(params.Timestamp) : NaN;
  return { kind: "content", speaker, text, at: Number.isFinite(ts) ? new Date(ts) : now };
}
