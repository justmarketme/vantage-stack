import { MESSAGES_3A } from "@/lib/consultant/metrics/tunables";
import { isPeriod } from "@/lib/consultant/metrics/periods";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { fail, isUuid, json } from "@/lib/consultant/server/http";
import { calculatorDefaults, funnel, teamFunnel } from "@/lib/consultant/server/repo/metrics";
import { consultantRoute } from "@/lib/consultant/server/route";
import type { FunnelMetrics, Period } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET metrics?period=today|week|month|quarter&consultantId=<uuid>|team
 * - no consultantId → the caller's own funnel (the legacy admin with no member id gets the team)
 * - another consultant or `team` → managers or `view_team_performance`
 * Periods are SAST. Every FunnelMetrics carries `defaults` (calculator defaults) for the UI.
 */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return consultantRoute("metrics.get", undefined, async (s, db) => {
    const p = sp.get("period") ?? "month";
    if (!isPeriod(p)) fail(400, MESSAGES.badRequest, { period: MESSAGES_3A.unknownPeriod });
    const period: Period = p;
    const target = sp.get("consultantId") ?? (s.memberId ? s.memberId : "team");
    const canSeeTeam = s.isManager || s.permissions.includes("view_team_performance");

    if (target === "team") {
      if (!canSeeTeam) fail(403, MESSAGES_3A.forbidden);
      const [t, defaults] = await Promise.all([teamFunnel(db, period), calculatorDefaults(db)]);
      return json({ team: { ...t.team, defaults }, byConsultant: t.byConsultant.map((r) => ({ ...r, defaults })) });
    }
    if (!isUuid(target)) fail(400, MESSAGES.badRequest, { consultantId: MESSAGES_3A.unknownConsultant });
    if (target.toLowerCase() !== s.memberId && !canSeeTeam) fail(403, MESSAGES_3A.forbidden);
    const [f, defaults] = await Promise.all([funnel(db, { consultantId: target.toLowerCase() }, period), calculatorDefaults(db)]);
    return json<FunnelMetrics>({ ...f, defaults });
  });
}
