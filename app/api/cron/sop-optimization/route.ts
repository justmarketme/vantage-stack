import { NextResponse } from "next/server";
import { withRetries } from "../../../../lib/scheduler-engine/retry";
import { runJobWithLogging } from "../../../../lib/scheduler-engine/jobs";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { runDailySopOptimization } from "../../../../lib/sop/workflows";

const SCHEDULE = "0 7 * * *";
const TIMEZONE = "UTC";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function handler(req: Request) {
  const url = new URL(req.url);
  const secret = (process.env.CRON_SECRET || "").trim();
  const provided = (url.searchParams.get("secret") || "").trim();
  if (secret && provided !== secret) return unauthorized();

  const maxAttempts = 2;

  const attemptOut = await withRetries({
    maxAttempts,
    baseDelayMs: 750,
    run: async (attempt) => {
      return runJobWithLogging({
        job_name: "sop-optimization",
        schedule: SCHEDULE,
        timezone: TIMEZONE,
        attempt,
        max_attempts: maxAttempts,
        fn: async () => {
          const out = await runDailySopOptimization();
          return { status: "success", summary: { projects_analyzed: out.projects_analyzed ?? null }, result: out };
        },
      });
    },
  });

  if (!attemptOut.ok) {
    const msg = attemptOut.error instanceof Error ? attemptOut.error.message : String(attemptOut.error);
    try {
      await sendTelegramAlert({ text: `🚨 Cron failed: sop-optimization (after ${attemptOut.attempts}/${maxAttempts} attempts)\n\n${msg}` });
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, error: msg, attempts: attemptOut.attempts }, { status: 500 });
  }

  return NextResponse.json({ ok: true, run: attemptOut.value.run, result: attemptOut.value.result });
}

export const GET = withApiMonitoring({ route: "/api/cron/sop-optimization", method: "GET", handler });

