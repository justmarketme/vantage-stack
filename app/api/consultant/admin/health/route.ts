import { systemHealth } from "@/lib/consultant/server/events/health";
import { json } from "@/lib/consultant/server/http";
import { consultantRoute } from "@/lib/consultant/server/route";
import type { SystemHealth } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return consultantRoute("admin.health", { permission: "view_system_health" }, async (_s, db) => json<SystemHealth>(await systemHealth(db)));
}
