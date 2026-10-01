import { MESSAGES_3A } from "@/lib/consultant/metrics/tunables";
import { isPeriod } from "@/lib/consultant/metrics/periods";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { fail, json } from "@/lib/consultant/server/http";
import { leaderboard } from "@/lib/consultant/server/repo/leaderboard";
import { consultantRoute } from "@/lib/consultant/server/route";
import type { Leaderboard } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET leaderboard?period=&rankBy=points|revenue — every consultant sees every row, commission included (decision). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  return consultantRoute("leaderboard.get", undefined, async (_s, db) => {
    const period = sp.get("period") ?? "month";
    const rankBy = sp.get("rankBy") ?? "points";
    const fields: Record<string, string> = {};
    if (!isPeriod(period)) fields.period = MESSAGES_3A.unknownPeriod;
    if (rankBy !== "points" && rankBy !== "revenue") fields.rankBy = "Use points or revenue";
    if (Object.keys(fields).length) fail(400, MESSAGES.badRequest, fields);
    return json<Leaderboard>(await leaderboard(db, period as Leaderboard["period"], rankBy as Leaderboard["rankedBy"]));
  });
}
