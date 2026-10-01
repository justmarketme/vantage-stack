import { appendSegment } from "@/lib/consultant/server/repo/segments";
import { parseTranscriptionEvent } from "@/lib/consultant/server/transcription";
import { handleWebhook, readTwilioWebhook, scheduleSummary } from "@/lib/consultant/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap — see docs/consultant-portal/DEPLOY.md

/**
 * Real-Time Transcription events for the browser (parent) leg. Only FINAL content is stored,
 * one row per utterance with a server-assigned seq (see appendSegment for race safety).
 * `transcription-stopped` means the last final result has been sent → summarise now.
 * Transcript text is never logged.
 */
export async function POST(req: Request) {
  const w = await readTwilioWebhook(req);
  if (w instanceof Response) return w;
  const { params, callId } = w;
  const callSid = params.CallSid;
  if (!callId || !callSid) return new Response(null, { status: 200 });

  const event = parseTranscriptionEvent(params);
  if (event.kind === "content") {
    return handleWebhook("voice.transcription", async (db) => {
      await appendSegment(db, callId, callSid, { speaker: event.speaker, text: event.text, at: event.at });
    });
  }
  if (event.kind === "stopped") scheduleSummary(callId, 0);
  if (event.kind === "error") console.warn("[consultant] transcription-error event", callId);
  return new Response(null, { status: 200 });
}
