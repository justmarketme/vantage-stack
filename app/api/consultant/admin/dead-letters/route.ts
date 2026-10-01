import { listDeadLetters, type DeadLetters } from "@/lib/consultant/server/events/health";
import { json } from "@/lib/consultant/server/http";
import { consultantRoute } from "@/lib/consultant/server/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dead event deliveries (grouped per event) and dead Emma messages. Generic error codes only. */
export async function GET() {
  return consultantRoute("admin.deadLetters", { permission: "view_system_health" }, async (_s, db) => json<DeadLetters>(await listDeadLetters(db)));
}
