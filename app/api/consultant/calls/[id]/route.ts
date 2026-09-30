import { MESSAGES } from "@/lib/consultant/server/constants";
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

/** Wrap-up: disposition, next action (mirrored onto the lead) and optional stage move. */
export async function PATCH(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("calls.patch", undefined, async (s, db) => {
    const callId = requireUuid(id, MESSAGES.callNotFound);
    const patch = await parseBody(req, CallPatch);
    return json<Call>(await patchCall(db, s, callId, patch));
  });
}
