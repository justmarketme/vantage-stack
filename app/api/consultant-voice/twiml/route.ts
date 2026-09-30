import { memberIdFromIdentity } from "@/lib/consultant/auth/identity";
import { consultantConfig } from "@/lib/consultant/config";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { connectConsultantDb, isUuid, logError } from "@/lib/consultant/server/http";
import { bindTwimlCall } from "@/lib/consultant/server/repo/callLifecycle";
import { buildDialTwiml, buildRefusalTwiml, twimlResponse } from "@/lib/consultant/server/voice";
import { readTwilioWebhook } from "@/lib/consultant/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CALL_SID = /^CA[0-9a-f]{32}$/i;

/**
 * TwiML App Voice URL. The browser's `Device.connect({ params: { CallId } })` lands here.
 * Security: the caller identity (`From=client:consultant_<memberId>`) must own the call, the
 * call must still be `initiated`, and the number dialled is the one stored on the lead —
 * nothing from the request is dialled. Any failure → a short spoken refusal + <Hangup/>.
 */
export async function POST(req: Request) {
  const w = await readTwilioWebhook(req);
  if (w instanceof Response) return w;

  const cfg = consultantConfig();
  const refuse = () => twimlResponse(buildRefusalTwiml(cfg, MESSAGES.callRefusedSpoken));
  const memberId = memberIdFromIdentity(w.params.From ?? "");
  const callId = isUuid(w.params.CallId) ? w.params.CallId.toLowerCase() : null;
  const callSid = CALL_SID.test(w.params.CallSid ?? "") ? w.params.CallSid : null;
  if (!memberId || !callId || !callSid || !cfg.twilio.callerId || !cfg.publicUrl) return refuse();

  try {
    const bound = await bindTwimlCall(await connectConsultantDb(), { callId, memberId, callSid });
    if (!bound) return refuse();
    return twimlResponse(buildDialTwiml(cfg, { callId, to: bound.to }));
  } catch (e) {
    logError("voice.twiml", e);
    return refuse();
  }
}
