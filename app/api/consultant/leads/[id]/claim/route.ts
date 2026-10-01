import { MESSAGES } from "@/lib/consultant/server/constants";
import { kickDispatch } from "@/lib/consultant/server/events/dispatch";
import { json, requireUuid } from "@/lib/consultant/server/http";
import { claimLead } from "@/lib/consultant/server/repo/leads";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import type { Lead } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("leads.claim", undefined, async (s, db) => {
    const lead = await claimLead(db, s, requireUuid(id, MESSAGES.leadNotFound));
    kickDispatch(); // lead.claimed event
    return json<Lead>(lead);
  });
}
