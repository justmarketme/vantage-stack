import { NextResponse } from "next/server";
import { withRetries } from "../../../../lib/scheduler-engine/retry";
import { runJobWithLogging } from "../../../../lib/scheduler-engine/jobs";
import { runMorningBriefing } from "../../../../lib/scheduler-engine/morning-briefing";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";
import { withApiMonitoring } from "../../../../lib/monitoring/api";

const SCHEDULE = "0 7 * * *";
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

async function sendBriefingToTelegram(message: string) {
  // Agent 12 "send to Telegram" is implemented here via Telegram bot env vars.
  const token = (process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_DEFAULT_CHAT_ID || "").trim();
  if (!token) throw new Error("Missing TELEGRAM_BOT_TOKEN.");
  if (!chatId) throw new Error("Missing TELEGRAM_CHAT_ID (or TELEGRAM_DEFAULT_CHAT_ID).");

  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${text}`);
  return text;
}

async function handler(req: Request) {
  if (!isCronAuthorized(req)) return unauthorized();

  const maxAttempts = 3;

  const attemptOut = await withRetries({
    maxAttempts,
    baseDelayMs: 750,
    run: async (attempt) => {
      return runJobWithLogging({
        job_name: "morning-briefing",
        schedule: SCHEDULE,
        timezone: TIMEZONE,
        attempt,
        max_attempts: maxAttempts,
        fn: async () => {
          const briefing = await runMorningBriefing();
          await sendBriefingToTelegram(briefing.message);
          return {
            status: "success",
            summary: { ...briefing.meta, telegram_sent: true },
            result: briefing,
          };
        },
      });
    },
  });

  if (!attemptOut.ok) {
    const msg = attemptOut.error instanceof Error ? attemptOut.error.message : String(attemptOut.error);
    try {
      await sendTelegramAlert({
        text: `🚨 Cron failed: morning-briefing (after ${attemptOut.attempts}/${maxAttempts} attempts)\n\n${msg}`,
      });
    } catch {
      // ignore
    }
    return NextResponse.json({ ok: false, error: msg, attempts: attemptOut.attempts }, { status: 500 });
  }

  return NextResponse.json({ ok: true, run: attemptOut.value.run, result: attemptOut.value.result });
}

export const GET = withApiMonitoring({ route: "/api/cron/morning-briefing", method: "GET", handler });

