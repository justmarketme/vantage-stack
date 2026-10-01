import { MESSAGES } from "@/lib/consultant/server/constants";
import { json, parseBody, requireUuid } from "@/lib/consultant/server/http";
import { nudgeLater } from "@/lib/consultant/server/realtime";
import { kickDispatch } from "@/lib/consultant/server/events/dispatch";
import { manualPaymentSource, recordPayment } from "@/lib/consultant/server/repo/deals";
import { writerId } from "@/lib/consultant/server/repo/scope";
import { consultantRoute } from "@/lib/consultant/server/route";
import { PaymentConfirmInput, type Deal } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ leadId: string }> };

/**
 * A manager confirms a payment (`confirm_payments`). Sets the deal paid + frozen commission,
 * moves the lead to `paid`. Idempotent: re-posting the same reference + amount returns the deal
 * unchanged. The outbox triggers emit deal.paid / lead.stage_changed; we kick delivery and nudge
 * the leaderboard after the response.
 */
export async function POST(req: Request, ctx: Ctx) {
  const leadIdRaw = (await ctx.params).leadId;
  return consultantRoute("deals.payment", { permission: "confirm_payments" }, async (s, db) => {
    const leadId = requireUuid(leadIdRaw, MESSAGES.leadNotFound);
    const memberId = writerId(s);
    const input = await parseBody(req, PaymentConfirmInput);
    const confirmation = manualPaymentSource.toConfirmation(input, { memberId });
    const { deal, changed } = await recordPayment(db, leadId, confirmation, { memberId, username: s.username, kind: "member" });
    if (changed) {
      kickDispatch();
      nudgeLater("leaderboard");
    }
    return json<Deal>(deal);
  });
}
