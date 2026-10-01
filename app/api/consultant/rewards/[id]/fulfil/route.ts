import { MESSAGES_3A } from "@/lib/consultant/metrics/tunables";
import { fail, json, requireUuid } from "@/lib/consultant/server/http";
import { fulfilReward } from "@/lib/consultant/server/repo/rewards";
import { writerId } from "@/lib/consultant/server/repo/scope";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import type { Reward } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mark a reward handed over (`manage_gamification`). Idempotent. */
export async function POST(_req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("rewards.fulfil", { permission: "manage_gamification" }, async (s, db) => {
    const reward = await fulfilReward(db, requireUuid(id, MESSAGES_3A.rewardNotFound), writerId(s));
    if (!reward) fail(404, MESSAGES_3A.rewardNotFound);
    return json<Reward>(reward);
  });
}
