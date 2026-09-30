import { after } from "next/server";
import { recordCallInCrm } from "@/lib/consultant/server/crmFeed";
import { connectConsultantDb, logError } from "@/lib/consultant/server/http";
import { applyCallStatus } from "@/lib/consultant/server/repo/callLifecycle";
import { mapTwilioCallStatus } from "@/lib/consultant/server/voice";
import { handleWebhook, parseSeconds, readTwilioWebhook, scheduleSummary } from "@/lib/consultant/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * `<Number statusCallback>` — the CLINIC leg's progress (initiated / ringing / answered /
 * completed). `CallSid` is the child leg, `ParentCallSid` the browser leg we bound.
 */
export async function POST(req: Request) {
  const w = await readTwilioWebhook(req);
  if (w instanceof Response) return w;
  const { params, callId } = w;
  const status = mapTwilioCallStatus(params.CallStatus);
  if (!callId || !status || !params.ParentCallSid) return new Response(null, { status: 200 });

  return handleWebhook("voice.status", async (db) => {
    const r = await applyCallStatus(db, {
      callId,
      parentSid: params.ParentCallSid,
      status,
      childSid: params.CallSid ?? null,
      durationSec: parseSeconds(params.CallDuration),
    });
    if (r.endedNow) {
      after(async () => {
        try {
          await recordCallInCrm(await connectConsultantDb(), callId);
        } catch (e) {
          logError("voice.status.crmFeed", e);
        }
      });
      scheduleSummary(callId);
    }
  });
}
