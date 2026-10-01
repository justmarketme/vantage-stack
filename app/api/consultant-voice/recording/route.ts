import { after } from "next/server";
import { recordCallInCrm } from "@/lib/consultant/server/crmFeed";
import { connectConsultantDb, logError } from "@/lib/consultant/server/http";
import { applyRecording } from "@/lib/consultant/server/repo/callLifecycle";
import { isRecordingSid } from "@/lib/consultant/server/voice";
import { handleWebhook, parseSeconds, readTwilioWebhook } from "@/lib/consultant/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `<Dial recordingStatusCallback>` — store the RecordingSid once the dual-channel recording
 * is `completed`. The media is only ever served through the authenticated proxy
 * (`GET /api/consultant/calls/[id]/recording`); no Twilio URL is stored or exposed.
 */
export async function POST(req: Request) {
  const w = await readTwilioWebhook(req);
  if (w instanceof Response) return w;
  const { params, callId } = w;
  if (!callId || params.RecordingStatus !== "completed" || !isRecordingSid(params.RecordingSid) || !params.CallSid) {
    return new Response(null, { status: 200 });
  }
  return handleWebhook("voice.recording", async (db) => {
    const stored = await applyRecording(db, {
      callId,
      callSid: params.CallSid,
      recordingSid: params.RecordingSid,
      durationSec: parseSeconds(params.RecordingDuration),
    });
    if (stored) {
      after(async () => {
        try {
          await recordCallInCrm(await connectConsultantDb(), callId);
        } catch (e) {
          logError("voice.recording.crmFeed", e);
        }
      });
    }
  });
}
