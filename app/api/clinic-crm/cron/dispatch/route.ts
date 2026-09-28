import { NextResponse, type NextRequest } from "next/server";
import { clinicDb } from "@/lib/clinic-crm/db";
import { drainOutbox, enqueueDue } from "@/lib/clinic-crm/server/outbox";
import { safeEqual } from "@/lib/clinic-crm/server/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The automation heartbeat: derive due reminder / no-show / recall rows from live
 * data, then drain the outbox within a bounded time budget. Safe to run as often
 * as you like and concurrently (dedupe keys + SKIP LOCKED).
 */
export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || "").trim();
  const header = req.headers.get("authorization") || "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const sql = await clinicDb();
    const enqueued = await enqueueDue(sql);
    const drained = await drainOutbox(sql);
    return NextResponse.json({ ok: true, enqueued, drained, ms: Date.now() - started });
  } catch (e) {
    console.error("[clinic-crm] dispatch failed", (e as { code?: string }).code ?? (e as Error).name);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
