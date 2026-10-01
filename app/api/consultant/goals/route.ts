import { json, parseBody } from "@/lib/consultant/server/http";
import { createGoal, listGoals } from "@/lib/consultant/server/repo/goals";
import { consultantRoute } from "@/lib/consultant/server/route";
import { GoalInput, type Goal } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The caller's Why Board, or (managers) `?consultantId=` anyone's. */
export async function GET(req: Request) {
  return consultantRoute("goals.list", undefined, async (s, db) => {
    const consultantId = new URL(req.url).searchParams.get("consultantId");
    return json<Goal[]>(await listGoals(db, s, consultantId));
  });
}

export async function POST(req: Request) {
  return consultantRoute("goals.create", undefined, async (s, db) => {
    const input = await parseBody(req, GoalInput);
    return json<Goal>(await createGoal(db, s, input), 201);
  });
}
