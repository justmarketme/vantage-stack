import { json, noContent, parseBody, requireUuid } from "@/lib/consultant/server/http";
import { deleteGoal, GOALS, patchGoal } from "@/lib/consultant/server/repo/goals";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import { GoalPatch, type Goal } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("goals.patch", undefined, async (s, db) => {
    const goalId = requireUuid(id, GOALS.messages.notFound);
    const patch = await parseBody(req, GoalPatch);
    return json<Goal>(await patchGoal(db, s, goalId, patch));
  });
}

/** Deletes the goal and its image. */
export async function DELETE(_req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("goals.delete", undefined, async (s, db) => {
    await deleteGoal(db, s, requireUuid(id, GOALS.messages.notFound));
    return noContent();
  });
}
