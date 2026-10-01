import { audit } from "@/lib/consultant/server/audit";
import { json, parseBody } from "@/lib/consultant/server/http";
import { nudgeLater } from "@/lib/consultant/server/realtime";
import { writerId } from "@/lib/consultant/server/repo/scope";
import { getGamificationSettings, putGamificationSettings } from "@/lib/consultant/server/repo/settings";
import { consultantRoute } from "@/lib/consultant/server/route";
import { GamificationSettings } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Any portal user can read the live tiers/points (the leaderboard shows them). */
export async function GET() {
  return consultantRoute("settings.gamification.get", undefined, async (_s, db) => json<GamificationSettings>(await getGamificationSettings(db)));
}

/** Replace the settings (`manage_gamification`). Audited with the key numbers only. */
export async function PUT(req: Request) {
  return consultantRoute("settings.gamification.put", { permission: "manage_gamification" }, async (s, db) => {
    const memberId = writerId(s);
    const value = await parseBody(req, GamificationSettings);
    const saved = await putGamificationSettings(db, value, memberId);
    await audit(db, {
      actorId: memberId,
      actorKind: "member",
      action: "settings.gamification_updated",
      entity: "settings",
      entityId: "gamification",
      meta: {
        quarterTarget: value.quarterTarget,
        tier1: value.tier1.monthlyRevenue,
        tier2: value.tier2.monthlyRevenue,
        tier3TopN: value.tier3.topN,
        tier3Min: value.tier3.minQuarterRevenue,
      },
    });
    nudgeLater("leaderboard");
    return json<GamificationSettings>(saved);
  });
}
