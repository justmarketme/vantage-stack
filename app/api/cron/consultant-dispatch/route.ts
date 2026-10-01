import { timingSafeEqual } from "node:crypto";
import { consultantConfig } from "@/lib/consultant/config";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { runDispatchCron } from "@/lib/consultant/server/events/cron";
import { apiError, json, withConsultantDb } from "@/lib/consultant/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby cap — see docs/consultant-portal/DEPLOY.md

/**
 * Every minute (external heartbeat — n8n/vantage-portal-heartbeat.workflow.json; Vercel Cron is a
 * daily backstop on Hobby): deliver events, send Emma messages, retry calendar syncs, award
 * tiers. `Authorization: Bearer $CRON_SECRET`, compared in constant time; fails CLOSED when no
 * secret is configured (this route sends WhatsApps and posts to n8n).
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
  return withConsultantDb("cron.dispatch", async (db) => json({ ok: true, ...(await runDispatchCron(db)) }));
}
