import { CALENDAR_MESSAGES } from "@/lib/consultant/server/calendar/constants";
import { listConnections, removeConnection } from "@/lib/consultant/server/calendar/connections";
import { isProvider } from "@/lib/consultant/server/calendar/providers";
import { fail, json } from "@/lib/consultant/server/http";
import { writerId } from "@/lib/consultant/server/repo/scope";
import { consultantRoute } from "@/lib/consultant/server/route";
import { auditSafe } from "@/lib/consultant/server/sideEffects";
import type { CalendarConnection } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ provider: string }> };

/** Disconnect: revoke at the provider (best effort), delete the encrypted tokens and pending syncs. */
export async function DELETE(_req: Request, ctx: Ctx) {
  const provider = (await ctx.params).provider;
  return consultantRoute("calendar.disconnect", undefined, async (s, db) => {
    if (!isProvider(provider)) fail(404, CALENDAR_MESSAGES.unknownProvider);
    const memberId = writerId(s);
    await removeConnection(db, memberId, provider);
    await auditSafe(db, { actorId: memberId, actorKind: "member", action: "calendar.disconnect", entity: "calendar_connection", entityId: provider });
    return json<CalendarConnection[]>(await listConnections(db, memberId));
  });
}
