import { MESSAGES } from "@/lib/consultant/server/constants";
import { fail, json } from "@/lib/consultant/server/http";
import { listRewards } from "@/lib/consultant/server/repo/rewards";
import { consultantRoute } from "@/lib/consultant/server/route";
import { consultantConfig } from "@/lib/consultant/config";
import type { Reward } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET rewards?status=pending|all — own rewards; managers / manage_gamification see everyone's. */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return consultantRoute("rewards.list", undefined, async (s, db) => {
    const status = sp.get("status") ?? "pending";
    if (status !== "pending" && status !== "all") fail(400, MESSAGES.badRequest, { status: "Use pending or all" });
    const all = s.isManager || s.permissions.includes("manage_gamification");
    return json<Reward[]>(await listRewards(db, { status, consultantId: all ? null : s.memberId, limit: consultantConfig().limits.listMax }));
  });
}
