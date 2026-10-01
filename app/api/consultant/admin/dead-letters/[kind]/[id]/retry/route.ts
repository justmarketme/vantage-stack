import { MESSAGES_3A } from "@/lib/consultant/metrics/tunables";
import { audit } from "@/lib/consultant/server/audit";
import { kickEmma, retryDeadMessage } from "@/lib/consultant/server/emma/sender";
import { kickDispatch, retryDeadEvent } from "@/lib/consultant/server/events/dispatch";
import { fail, json, requireUuid } from "@/lib/consultant/server/http";
import { consultantRoute } from "@/lib/consultant/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ kind: string; id: string }> };

/** Put a dead event (all its dead deliveries) or a dead Emma message back in the queue. */
export async function POST(_req: Request, ctx: Ctx) {
  const { kind, id } = await ctx.params;
  return consultantRoute("admin.deadLetters.retry", { permission: "view_system_health" }, async (s, db) => {
    if (kind !== "event" && kind !== "message") fail(404, MESSAGES_3A.unknownKind);
    const uuid = requireUuid(id);
    const count = kind === "event" ? await retryDeadEvent(db, uuid) : (await retryDeadMessage(db, uuid)) ? 1 : 0;
    if (!count) fail(409, MESSAGES_3A.nothingToRetry);
    await audit(db, { actorId: s.memberId, actorKind: "member", action: `dead_letter.retry_${kind}`, entity: kind, entityId: uuid, meta: { rows: count } });
    if (kind === "event") kickDispatch();
    else kickEmma();
    return json({ ok: true, requeued: count });
  });
}
