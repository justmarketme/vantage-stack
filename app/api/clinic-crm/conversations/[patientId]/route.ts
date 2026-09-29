import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { noStore, notFound, route } from "@/lib/clinic-crm/server/http";
import { isUuid } from "@/lib/clinic-crm/server/rules";
import { readThread } from "@/lib/clinic-crm/server/repo/messages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The thread with one patient; marks their inbound messages read. */
export const GET = route<{ patientId: string }>("conversations.thread", async (req: NextRequest, ctx) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const { patientId } = await ctx.params;
  if (!isUuid(patientId)) return notFound();
  const sql = await clinicDb();
  const messages = await readThread(sql, s.clinicId, patientId);
  if (!messages) return notFound();
  await audit(sql, s.clinicId, s.staffId, "read", "messages", patientId);
  return NextResponse.json(messages, noStore);
});
