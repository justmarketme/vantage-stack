import { MESSAGES } from "@/lib/consultant/server/constants";
import { fail, isUuid, json } from "@/lib/consultant/server/http";
import { todayStats } from "@/lib/consultant/server/repo/stats";
import { consultantRoute } from "@/lib/consultant/server/route";
import type { TodayStats } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Own stats; managers may pass `?consultantId=`. The legacy admin (no member id) gets the team total. */
export async function GET(req: Request) {
  return consultantRoute("stats.today", undefined, async (s, db) => {
    const requested = new URL(req.url).searchParams.get("consultantId");
    let consultantId = s.memberId;
    if (requested) {
      if (!s.isManager) fail(403, MESSAGES.managersOnly);
      if (!isUuid(requested)) fail(400, MESSAGES.badRequest, { consultantId: MESSAGES.unknownConsultant });
      consultantId = requested.toLowerCase();
    }
    return json<TodayStats>(await todayStats(db, consultantId));
  });
}
