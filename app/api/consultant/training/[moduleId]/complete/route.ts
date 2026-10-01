import { fail, json } from "@/lib/consultant/server/http";
import { completeModule, TRAINING_MESSAGES } from "@/lib/consultant/server/repo/training";
import { consultantRoute } from "@/lib/consultant/server/route";
import type { TrainingModule } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ moduleId: string }> };

/** Mark a module complete (idempotent; 409 while it is still locked). Returns the updated list. */
export async function POST(_req: Request, ctx: Ctx) {
  const moduleId = (await ctx.params).moduleId;
  return consultantRoute("training.complete", undefined, async (s, db) => {
    if (!/^[a-z0-9-]{1,80}$/.test(moduleId)) fail(404, TRAINING_MESSAGES.notFound);
    return json<TrainingModule[]>(await completeModule(db, s, moduleId));
  });
}
