import { NextResponse } from "next/server";
import { withRetries } from "../../../../lib/scheduler-engine/retry";
import { runJobWithLogging } from "../../../../lib/scheduler-engine/jobs";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { connectProspectingDb } from "../../../../lib/prospecting/db";
import { startRun, finishRun, listChannels, listEngagements, getDailyStats } from "../../../../lib/prospecting/service";
import { sendCycleDigest, sendDailyBrief } from "../../../../lib/prospecting/teams";

const SCHEDULE = "0 */3 * * *";
const TIMEZONE = "Africa/Johannesburg";

function isCronAuthorized(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const authHeader = req.headers.get("authorization")?.trim() || "";
  const expected = `Bearer ${secret}`;
  if (authHeader === expected || authHeader === secret) return true;
  const url = new URL(req.url);
  return (url.searchParams.get("secret") || "").trim() === secret;
}

async function runProspectingCycle() {
  const db = await connectProspectingDb();
  if (!db) throw new Error("No database connection");

  const run = await startRun(db, "cron");
  const started = Date.now();

  try {
    const channels = await listChannels(db, { enabled: true });
    const channelNames = channels.map((c) => `${c.platform}/${c.channel_name}`);

    // Check for responses to previously engaged threads
    const recentPosted = await listEngagements(db, { status: "posted", limit: 100 });
    let hotLeads = 0;

    // For now, mark the cycle as complete with channels scanned
    // Browser-based scanning happens via manual trigger sessions
    // This cron handles: digest, daily brief, response monitoring

    const result = await finishRun(db, run.id, {
      channels_scanned: channelNames,
      signals_found: 0,
      leads_created: 0,
      drafts_created: 0,
      hot_leads_flagged: hotLeads,
      status: "completed",
      summary: {
        channels_count: channels.length,
        posted_engagements_checked: recentPosted.length,
      },
    });

    const durationSeconds = (Date.now() - started) / 1000;

    await sendCycleDigest({
      run_id: run.id,
      channels_scanned: channelNames,
      signals_found: 0,
      leads_created: 0,
      drafts_created: 0,
      hot_leads_flagged: hotLeads,
      duration_seconds: durationSeconds,
    }).catch(() => {});

    // Check if this is the 07:00 SAST cycle — send daily brief
    const now = new Date();
    const saHour = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Johannesburg" })).getHours();
    if (saHour >= 7 && saHour < 8) {
      const stats = await getDailyStats(db);
      const svc = await import("../../../../lib/prospecting/service");
      const recentLeads = await svc.listProspects(db, { limit: 10 });
      await sendDailyBrief({
        date: new Date().toISOString().slice(0, 10),
        top_leads: recentLeads.map((p) => ({
          name: p.name || "Unknown",
          business: p.business_name || "?",
          platform: p.source_platform,
          pain: p.pain_point,
          confidence: p.confidence_flag,
        })),
        stats: {
          found: stats.leads_found,
          contacted: stats.leads_contacted,
          responded: stats.leads_responded,
          booked: stats.calls_booked,
        },
        pending_approvals: stats.pending_approvals,
      }).catch(() => {});
    }

    return result;
  } catch (e) {
    await finishRun(db, run.id, {
      channels_scanned: [],
      signals_found: 0,
      leads_created: 0,
      drafts_created: 0,
      hot_leads_flagged: 0,
      status: "failed",
      error: { message: e instanceof Error ? e.message : String(e) },
    });
    throw e;
  }
}

async function handler(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const maxAttempts = 2;

  const attemptOut = await withRetries({
    maxAttempts,
    baseDelayMs: 1000,
    run: async (attempt) => {
      return runJobWithLogging({
        job_name: "prospecting-cycle",
        schedule: SCHEDULE,
        timezone: TIMEZONE,
        attempt,
        max_attempts: maxAttempts,
        fn: async () => {
          const result = await runProspectingCycle();
          return {
            status: "success" as const,
            summary: result.summary as Record<string, unknown>,
            result,
          };
        },
      });
    },
  });

  if (!attemptOut.ok) {
    const msg = attemptOut.error instanceof Error ? attemptOut.error.message : String(attemptOut.error);
    try {
      await sendTelegramAlert({
        text: `🚨 Cron failed: prospecting-cycle (after ${attemptOut.attempts}/${maxAttempts} attempts)\n\n${msg}`,
      });
    } catch { /* ignore */ }
    return NextResponse.json({ ok: false, error: msg, attempts: attemptOut.attempts }, { status: 500 });
  }

  return NextResponse.json({ ok: true, run: attemptOut.value.run, result: attemptOut.value.result });
}

export const GET = withApiMonitoring({ route: "/api/cron/prospecting", method: "GET", handler });
