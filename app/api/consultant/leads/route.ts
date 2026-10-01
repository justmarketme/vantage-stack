import { MESSAGES } from "@/lib/consultant/server/constants";
import { kickDispatch } from "@/lib/consultant/server/events/dispatch";
import { apiError, json, parseBody } from "@/lib/consultant/server/http";
import { createLead, listLeads, parseLeadListQuery } from "@/lib/consultant/server/repo/leads";
import { consultantRoute } from "@/lib/consultant/server/route";
import { LeadInput, type Lead } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * List by `stage` / `scope` only. Free-text search moved to POST /api/consultant/leads/search so a
 * phone number or name can never land in a URL or access log (POPIA): a `q` here is a 400.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  if (sp.has("q")) return apiError(400, MESSAGES.badRequest, { q: "Search with POST /api/consultant/leads/search." });
  return consultantRoute("leads.list", undefined, async (s, db) => {
    const query = parseLeadListQuery(sp);
    return json<Lead[]>(await listLeads(db, s, query));
  });
}

/** Create a Clinics lead owned by the caller. 409 `{fields:{phone}}` if the phone already exists. */
export async function POST(req: Request) {
  return consultantRoute("leads.create", undefined, async (s, db) => {
    const input = await parseBody(req, LeadInput);
    const lead = await createLead(db, s, input);
    kickDispatch(); // deliver the trigger-written lead.created event now, not at the next cron
    return json<Lead>(lead, 201);
  });
}
