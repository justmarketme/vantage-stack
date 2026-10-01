import { json, parseBody } from "@/lib/consultant/server/http";
import { listLeads } from "@/lib/consultant/server/repo/leads";
import { consultantRoute } from "@/lib/consultant/server/route";
import { LeadSearchInput, type Lead } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lead search. POST so the search text — which may be a phone number or a contact's name —
 * travels in the body and never appears in a URL, access log or browser history (POPIA).
 */
export async function POST(req: Request) {
  return consultantRoute("leads.search", undefined, async (s, db) => {
    const input = await parseBody(req, LeadSearchInput);
    return json<Lead[]>(await listLeads(db, s, { q: input.q || undefined, stage: input.stage, scope: input.scope }));
  });
}
