import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/clinic-crm/auth/session";
import { audit, clinicDb } from "@/lib/clinic-crm/db";
import { AppointmentPatch } from "@/lib/clinic-crm/types";
import { idParam, notFound, parseBody, route } from "@/lib/clinic-crm/server/http";
import { cancelReminders, scheduleNoShow, scheduleReminder } from "@/lib/clinic-crm/server/outbox";
import { updateAppointment } from "@/lib/clinic-crm/server/repo/appointments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = route<{ id: string }>("appointments.update", async (req: NextRequest, ctx) => {
  const s = await requireSession(req);
  if (s instanceof NextResponse) return s;
  const id = await idParam(ctx);
  if (!id) return notFound();
  const body = await parseBody(req, AppointmentPatch);
  if (!body.ok) return body.res;
  const sql = await clinicDb();
  const res = await updateAppointment(sql, s.clinicId, id, body.data);
  if (!res) return notFound();
  const { before, after } = res;

  const moved = before.startsAt !== after.startsAt;
  const statusChanged = before.status !== after.status;
  if (after.status === "booked" || after.status === "confirmed") {
    // Reschedule → new dedupe key; the stale pending reminder is cancelled.
    if (moved || statusChanged) await scheduleReminder(sql, s.clinicId, after);
  } else if (statusChanged) {
    await cancelReminders(sql, s.clinicId, after.id, "cancelled");
  }
  if (statusChanged && after.status === "no_show") await scheduleNoShow(sql, s.clinicId, after);

  await audit(sql, s.clinicId, s.staffId, statusChanged ? `status:${after.status}` : "update", "appointment", id);
  return NextResponse.json(after);
});
