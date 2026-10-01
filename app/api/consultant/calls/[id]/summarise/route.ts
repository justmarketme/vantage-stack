import { after } from "next/server";
import { rateLimit } from "@/lib/consultant/auth/rateLimit";
import { consultantConfig } from "@/lib/consultant/config";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { connectConsultantDb, fail, json, logError, requireUuid } from "@/lib/consultant/server/http";
import { assertOwnCall, requireCall } from "@/lib/consultant/server/repo/calls";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import { summariseCall } from "@/lib/consultant/server/summarise";
import type { Call } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap — see docs/consultant-portal/DEPLOY.md

/**
 * Re-run Coach Alex (idempotent, 202-style). An ended call whose summary failed or was
 * skipped is queued (pending) and summarised after the response; ready / processing calls
 * are left alone. Always returns the call's current state.
 */
export async function POST(_req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("calls.summarise", undefined, async (s, db) => {
    const callId = requireUuid(id, MESSAGES.callNotFound);
    const call = await requireCall(db, s, callId);
    assertOwnCall(s, call);
    const cfg = consultantConfig();
    if (!rateLimit(`summarise:${s.memberId ?? s.username}`, cfg.limits.callsPerMinute, 60_000)) fail(429, MESSAGES.rateLimited);

    const queued = await db`
      update public.consultant_calls set summary_status = 'pending', summary_error = null, updated_at = now()
      where id = ${callId}::uuid and ended_at is not null and summary_status in ('failed', 'skipped', 'pending')
      returning id
    `;
    if (queued.length) {
      after(async () => {
        try {
          await summariseCall(await connectConsultantDb(), callId, { manual: true });
        } catch (e) {
          logError("calls.summarise.after", e);
        }
      });
    }
    return json<Call>(await requireCall(db, s, callId), 202);
  });
}
