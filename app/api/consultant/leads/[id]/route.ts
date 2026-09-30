import { MESSAGES } from "@/lib/consultant/server/constants";
import { json, parseBody, requireUuid } from "@/lib/consultant/server/http";
import { listCallsForLead } from "@/lib/consultant/server/repo/calls";
import { patchLead, requireLead } from "@/lib/consultant/server/repo/leads";
import { listNotes } from "@/lib/consultant/server/repo/notes";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import { LeadPatch, type Lead, type LeadDetail } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("leads.get", undefined, async (s, db) => {
    const lead = await requireLead(db, s, requireUuid(id, MESSAGES.leadNotFound));
    const [calls, notes] = await Promise.all([listCallsForLead(db, lead.id), listNotes(db, { leadId: lead.id })]);
    return json<LeadDetail>({ lead, calls, notes });
  });
}

export async function PATCH(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("leads.patch", undefined, async (s, db) => {
    const leadId = requireUuid(id, MESSAGES.leadNotFound);
    const patch = await parseBody(req, LeadPatch);
    return json<Lead>(await patchLead(db, s, leadId, patch));
  });
}
