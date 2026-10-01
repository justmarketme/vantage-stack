import { json, parseBody } from "@/lib/consultant/server/http";
import { importLeads } from "@/lib/consultant/server/repo/leadImport";
import { consultantRoute } from "@/lib/consultant/server/route";
import { ScrapedLeadImport, type ScrapedImportResult } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Managers send found clinics (public listings / research tools) into the Clinics pool.
 * +27 only, deduped on phone / place id, unassigned, `lead_source = public_scrape`, no messaging
 * consent (Decision 8). Returns counts only.
 */
export async function POST(req: Request) {
  return consultantRoute("leads.import", { manager: true }, async (s, db) => {
    const batch = await parseBody(req, ScrapedLeadImport);
    return json<ScrapedImportResult>(await importLeads(db, batch, { memberId: s.memberId, kind: "member" }));
  });
}
