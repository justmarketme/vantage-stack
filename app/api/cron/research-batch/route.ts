import { NextResponse } from "next/server";
import { withRetries } from "../../../../lib/scheduler-engine/retry";
import { runJobWithLogging } from "../../../../lib/scheduler-engine/jobs";
import { runResearchBatch } from "../../../../lib/scheduler-engine/research-batch";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";
import { withApiMonitoring } from "../../../../lib/monitoring/api";

const SCHEDULE = "0 2 * * *";
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
        job_name: "research-batch",
        schedule: SCHEDULE,
        timezone: TIMEZONE,
        attempt,
        max_attempts: maxAttempts,
        fn: async () => {
          const out = await runResearchBatch({ limit: 100 });
          const status = out.clients_failed === 0 ? "success" : out.clients_success > 0 ? "partial" : "failed";
          return { status, summary: out, result: out };
        },
      });
    },
  });

  if (!attemptOut.ok) {
    const msg = attemptOut.error instanceof Error ? attemptOut.error.message : String(attemptOut.error);
    try {
      await sendTelegramAlert({
        text: `🚨 Cron failed: research-batch (after ${attemptOut.attempts}/${maxAttempts} attempts)\n\n${msg}`,
      });
    } catch {
      // ignore alert failure
    }
    return NextResponse.json({ ok: false, error: msg, attempts: attemptOut.attempts }, { status: 500 });
  }

  return NextResponse.json({ ok: true, run: attemptOut.value.run, result: attemptOut.value.result });
}

export const GET = withApiMonitoring({ route: "/api/cron/research-batch", method: "GET", handler });

