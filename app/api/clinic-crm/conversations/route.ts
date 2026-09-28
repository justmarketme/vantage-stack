import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { noStore, route } from "@/lib/clinic-crm/server/http";
import { listConversations } from "@/lib/clinic-crm/server/repo/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route("conversations.list", async (req: NextRequest) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const sql = await clinicDb();
  const rows = await listConversations(sql, s.clinicId);
  await audit(sql, s.clinicId, s.staffId, "list", "conversations");
  return NextResponse.json(rows, noStore);
});
