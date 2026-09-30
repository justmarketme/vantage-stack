import { MESSAGES } from "@/lib/consultant/server/constants";
import { noContent, parseBody, requireUuid } from "@/lib/consultant/server/http";
import { insertCardEvents } from "@/lib/consultant/server/repo/cards";
import { assertOwnCall, requireCall } from "@/lib/consultant/server/repo/calls";
import { writerId } from "@/lib/consultant/server/repo/scope";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import { CardEventInput } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Coach Alex card telemetry (shown / used / dismissed), batched by the client. */
export async function POST(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("calls.cards", undefined, async (s, db) => {
    writerId(s);
    const callId = requireUuid(id, MESSAGES.callNotFound);
    const call = await requireCall(db, s, callId);
    assertOwnCall(s, call);
    const input = await parseBody(req, CardEventInput);
    await insertCardEvents(db, callId, input);
    return noContent();
  });
}
