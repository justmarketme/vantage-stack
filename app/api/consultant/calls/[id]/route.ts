import { MESSAGES } from "@/lib/consultant/server/constants";
import { recordCallConsent } from "@/lib/consultant/server/emma/consent";
import { kickDispatch } from "@/lib/consultant/server/events/dispatch";
import { json, parseBody, requireUuid } from "@/lib/consultant/server/http";
import { getCallDetail, patchCall } from "@/lib/consultant/server/repo/calls";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import { CallPatch, type Call, type CallDetail } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("calls.get", undefined, async (s, db) =>
    json<CallDetail>(await getCallDetail(db, s, requireUuid(id, MESSAGES.callNotFound))),
  );
}

/** Wrap-up: disposition, next action (mirrored onto the lead), optional stage move and WhatsApp consent. */
export async function PATCH(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("calls.patch", undefined, async (s, db) => {
    const callId = requireUuid(id, MESSAGES.callNotFound);
    const patch = await parseBody(req, CallPatch);
    const call = await patchCall(db, s, callId, patch); // ownership + scope enforced here
    // Decision 8 (POPIA s.69): the clinic agreed on this call to WhatsApp/SMS follow-ups.
    // `false` is "not asked / declined" — never an opt-out, and never reverses one.
    if (patch.whatsappConsent === true) {
      await recordCallConsent(db, { leadId: call.leadId, callId: call.id, memberId: s.memberId });
    }
    if (patch.salesStage !== undefined) kickDispatch(); // the wrap-up moved the lead → lead.stage_changed
    return json<Call>(call);
  });
}
