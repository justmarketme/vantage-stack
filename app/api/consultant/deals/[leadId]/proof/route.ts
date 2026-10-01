import { NextResponse } from "next/server";
import { MESSAGES_3A } from "@/lib/consultant/metrics/tunables";
import { audit } from "@/lib/consultant/server/audit";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { fail, requireUuid } from "@/lib/consultant/server/http";
import { proofFor } from "@/lib/consultant/server/repo/deals";
import { consultantRoute } from "@/lib/consultant/server/route";
import { signedViewUrl } from "@/lib/consultant/server/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ leadId: string }> };

/**
 * 302 to a short-lived signed URL for the proof of payment. Only the lead's / deal's consultant
 * or a manager. Every view is audited (POPIA). The signed URL is never logged.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const leadIdRaw = (await ctx.params).leadId;
  return consultantRoute("deals.proof", undefined, async (s, db) => {
    const leadId = requireUuid(leadIdRaw, MESSAGES.leadNotFound);
    const p = await proofFor(db, leadId);
    if (!p) fail(404, MESSAGES.leadNotFound);
    const own = !!s.memberId && (p.consultantId === s.memberId || p.leadConsultantId === s.memberId);
    if (!s.isManager && !own) fail(404, MESSAGES.leadNotFound); // don't reveal other consultants' deals
    if (!p.path) fail(404, MESSAGES_3A.noProof);
    const url = await signedViewUrl(p.path);
    if (!url) fail(503, MESSAGES_3A.proofUnavailable);
    await audit(db, { actorId: s.memberId, actorKind: "member", action: "payment.proof_viewed", entity: "lead", entityId: leadId });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  });
}
