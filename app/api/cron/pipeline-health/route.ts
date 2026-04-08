import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { runJobWithLogging } from "../../../../lib/scheduler-engine/jobs";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";
import { connectCrmDb } from "../../../../lib/crm/db";

const SCHEDULE = "0 6 * * *";
const TIMEZONE = "UTC";

function isCronAuthorized(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}` || auth === secret) return true;
  const url = new URL(req.url);
  return (url.searchParams.get("secret") || "").trim() === secret;
}

type StageResult = {
  stage: string;
  count: number;
  oldest_days: number | null;
  alert: boolean;
  reason?: string;
};

async function handler(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { run } = await runJobWithLogging({
    job_name: "pipeline-health",
    schedule: SCHEDULE,
    timezone: TIMEZONE,
    attempt: 1,
    max_attempts: 2,
    fn: async () => {
      const db = await connectCrmDb();
      if (!db) {
        return {
          status: "failed" as const,
          summary: { error: "No database connection" },
        };
      }

      try {
        // Thresholds (days): how long a client can sit in a stage before it's flagged
        const stageThresholds: Record<string, number> = {
          "blueprint-submitted": 3,   // Should be reviewed within 3 days
          "report-sent": 7,           // Proposal should follow within 7 days
          "proposal-sent": 14,        // Should be accepted or followed up within 14 days
          "upsell-sent": 21,          // Upsell should be resolved within 21 days
        };

        const alerts: string[] = [];
        const results: StageResult[] = [];

        for (const [stage, maxDays] of Object.entries(stageThresholds)) {
          const rows = await db.unsafe<Array<{ count: string; oldest_days: string | null }>>(
            `select
              count(*)::text as count,
              max(extract(epoch from (now() - coalesce(last_active_at, updated_at, created_at))) / 86400)::text as oldest_days
            from public.clients
            where status = $1`,
            [stage],
          );

          const count = Number(rows[0]?.count ?? 0);
          const oldestDays = rows[0]?.oldest_days != null ? Math.round(Number(rows[0].oldest_days)) : null;
          const stageAlert = oldestDays != null && oldestDays > maxDays;

          const r: StageResult = { stage, count, oldest_days: oldestDays, alert: stageAlert };
          if (stageAlert) {
            r.reason = `Oldest client stuck ${oldestDays}d (threshold: ${maxDays}d)`;
            alerts.push(`⚠️ Pipeline stuck — ${stage}: ${count} client(s), oldest ${oldestDays}d (max ${maxDays}d)`);
          }
          results.push(r);
        }

        // Check for clients with no activity in 30+ days who are active
        const staleRows = await db.unsafe<Array<{ count: string }>>(
          `select count(*)::text as count from public.clients
           where status = 'active-client'
           and coalesce(last_active_at, updated_at, created_at) < now() - interval '30 days'`,
        );
        const staleCount = Number(staleRows[0]?.count ?? 0);
        if (staleCount > 0) {
          alerts.push(`⚠️ ${staleCount} active client(s) with no activity in 30+ days — churn risk`);
          results.push({ stage: "active-client (stale)", count: staleCount, oldest_days: null, alert: true, reason: "No activity in 30+ days" });
        }

        // Send consolidated Telegram alert if anything flagged
        if (alerts.length > 0) {
          const msg = `🔴 Pipeline Health Check — ${new Date().toISOString().slice(0, 10)}\n\n${alerts.join("\n")}\n\nReview: /crm/pipeline`;
          await sendTelegramAlert({ text: msg }).catch(() => {});
        }

        return {
          status: alerts.length === 0 ? ("success" as const) : ("partial" as const),
          summary: {
            checked_stages: results.length,
            alerts: alerts.length,
            results,
          },
        };
      } finally {
        await db.end({ timeout: 5 });
      }
    },
  });

  return NextResponse.json({ ok: true, run });
}

export const GET = withApiMonitoring({ route: "/api/cron/pipeline-health", method: "GET", handler });
