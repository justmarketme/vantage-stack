import { json, parseBody } from "@/lib/consultant/server/http";
import { createLead, listLeads, parseLeadListQuery } from "@/lib/consultant/server/repo/leads";
import { consultantRoute } from "@/lib/consultant/server/route";
import { LeadInput, type Lead } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return consultantRoute("leads.list", undefined, async (s, db) => {
    const query = parseLeadListQuery(new URL(req.url).searchParams);
    return json<Lead[]>(await listLeads(db, s, query));
  });
}

/** Create a Clinics lead owned by the caller. 409 `{fields:{phone}}` if the phone already exists. */
export async function POST(req: Request) {
  return consultantRoute("leads.create", undefined, async (s, db) => {
    const input = await parseBody(req, LeadInput);
    return json<Lead>(await createLead(db, s, input), 201);
  });
}
