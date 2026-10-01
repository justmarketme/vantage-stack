import { MESSAGES_3A } from "@/lib/consultant/metrics/tunables";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { listMessagesForLead } from "@/lib/consultant/server/emma/sender";
import { fail, isUuid, json } from "@/lib/consultant/server/http";
import { requireLead } from "@/lib/consultant/server/repo/leads";
import { consultantRoute } from "@/lib/consultant/server/route";
import type { EmmaMessage } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET messages?leadId= — Emma's message history for a lead (template, status, timing; never
 * bodies or numbers). Lead owner or manager; an unassigned pool lead is visible to the next
 * consultant too (decision: pool leads keep their full history).
 */
export async function GET(req: Request) {
  const leadId = new URL(req.url).searchParams.get("leadId");
  return consultantRoute("messages.list", undefined, async (s, db) => {
    if (!isUuid(leadId)) fail(400, MESSAGES.badRequest, { leadId: MESSAGES_3A.leadIdRequired });
    const lead = await requireLead(db, s, leadId.toLowerCase());
    if (!s.isManager && lead.consultantId && lead.consultantId !== s.memberId) fail(404, MESSAGES.leadNotFound);
    return json<EmmaMessage[]>(await listMessagesForLead(db, lead.id));
  });
}
