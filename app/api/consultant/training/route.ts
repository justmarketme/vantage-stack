import { json } from "@/lib/consultant/server/http";
import { listTraining } from "@/lib/consultant/server/repo/training";
import { consultantRoute } from "@/lib/consultant/server/route";
import type { TrainingModule } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return consultantRoute("training.list", undefined, async (s, db) => json<TrainingModule[]>(await listTraining(db, s)));
}
