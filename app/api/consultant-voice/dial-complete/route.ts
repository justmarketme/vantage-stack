import { after } from "next/server";
import { recordCallInCrm } from "@/lib/consultant/server/crmFeed";
import { kickDispatch } from "@/lib/consultant/server/events/dispatch";
import { connectConsultantDb, logError } from "@/lib/consultant/server/http";
import { applyCallStatus } from "@/lib/consultant/server/repo/callLifecycle";
import { buildHangupTwiml, mapTwilioCallStatus, twimlResponse } from "@/lib/consultant/server/voice";
import { handleWebhook, parseSeconds, readTwilioWebhook, scheduleSummary } from "@/lib/consultant/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap — see docs/consultant-portal/DEPLOY.md

/**
 * `<Dial action>` — the dial attempt is over (answered-and-finished, busy, no-answer, …).
 * `CallSid` is the browser (parent) leg; `DialCallSid` / `DialCallDuration` the clinic leg.
 * Answers `<Hangup/>` so the browser leg ends with the bridged call.
 */
export async function POST(req: Request) {
  const w = await readTwilioWebhook(req);
  if (w instanceof Response) return w;
  const { params, callId } = w;
  const hangup = () => twimlResponse(buildHangupTwiml());
  if (!callId || !params.CallSid) return hangup();

  return handleWebhook(
    "voice.dialComplete",
    async (db) => {
      const r = await applyCallStatus(db, {
        callId,
        parentSid: params.CallSid,
        status: mapTwilioCallStatus(params.DialCallStatus) ?? "completed",
        childSid: params.DialCallSid ?? null,
        durationSec: parseSeconds(params.DialCallDuration),
      });
      if (r.endedNow) {
        after(async () => {
          try {
            await recordCallInCrm(await connectConsultantDb(), callId);
          } catch (e) {
            logError("voice.dialComplete.crmFeed", e);
          }
        });
        scheduleSummary(callId);
        kickDispatch(); // call.completed event
      }
    },
    hangup,
  );
}
