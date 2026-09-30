import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { consultantConfig } from "@/lib/consultant/config";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { apiError, withConsultantDb } from "@/lib/consultant/server/http";
import { runConsultantSweep } from "@/lib/consultant/server/sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends). Unlike some older crons this
 * fails CLOSED: no secret configured → 401, because the sweep calls Claude and Twilio.
 */
function authorised(req: Request): boolean {
  const secret = consultantConfig().cronSecret;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization")?.trim() ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorised(req)) return apiError(401, MESSAGES.unauthorized);
  return withConsultantDb("cron.sweep", async (db) => NextResponse.json({ ok: true, ...(await runConsultantSweep(db)) }));
}
