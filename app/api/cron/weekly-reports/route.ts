import { NextResponse } from "next/server";
import { runWeeklyPipeline } from "../../../../lib/weekly-scheduler/pipeline";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { withRetries } from "../../../../lib/scheduler-engine/retry";
import { runJobWithLogging } from "../../../../lib/scheduler-engine/jobs";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";

const SCHEDULE = "0 8 * * 2";
const TIMEZONE = "UTC";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function isCronAuthorized(req: Request) {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;

  const authHeader =
    req.headers.get("authorization")?.trim() ||
    req.headers.get("Authorization")?.trim() ||
    "";
  const expected = `Bearer ${secret}`;
  if (authHeader === expected || authHeader === secret) return true;

  const url = new URL(req.url);
  const provided = (url.searchParams.get("secret") || "").trim();
  if (provided && provided === secret) return true;
  return false;
}

async function handler(req: Request) {
  if (!isCronAuthorized(req)) return unauthorized();

  const maxAttempts = 3;

  const attemptOut = await withRetries({
    maxAttempts,
    baseDelayMs: 750,
    run: async (attempt) => {
      return runJobWithLogging({
        job_name: "weekly-reports",
        schedule: SCHEDULE,
        timezone: TIMEZONE,
        attempt,
        max_attempts: maxAttempts,
        fn: async () => {
          const out = await runWeeklyPipeline({ schedule: SCHEDULE });
          const status =
            out.run.status === "success" ? "success" : out.run.status === "partial" ? "partial" : "failed";
          return {
            status,
            summary: { run: out.run, per_client: out.per_client },
            result: out,
          };
        },
      });
    },
  });

  if (!attemptOut.ok) {
    const msg = attemptOut.error instanceof Error ? attemptOut.error.message : String(attemptOut.error);
    await sendTelegramAlert({
      text: `🚨 Cron failed: weekly-reports (after ${attemptOut.attempts}/${maxAttempts} attempts)\n\n${msg}`,
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg, attempts: attemptOut.attempts }, { status: 500 });
  }

  return NextResponse.json({ ok: true, run: attemptOut.value.run, result: attemptOut.value.result });
}

export const GET = withApiMonitoring({ route: "/api/cron/weekly-reports", method: "GET", handler });

