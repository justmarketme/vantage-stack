import { MESSAGES } from "@/lib/consultant/server/constants";
import { fail, json, requireUuid } from "@/lib/consultant/server/http";
import { getLiveState } from "@/lib/consultant/server/repo/calls";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import type { LiveCallState } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled every cfg.live.pollMs during a call: segments with seq > `after`. */
export async function GET(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("calls.live", undefined, async (s, db) => {
    const raw = new URL(req.url).searchParams.get("after") ?? "0";
    if (!/^\d{1,9}$/.test(raw)) fail(400, MESSAGES.badRequest, { after: "Must be a whole number" });
    return json<LiveCallState>(await getLiveState(db, s, requireUuid(id, MESSAGES.callNotFound), Number(raw)));
  });
}
