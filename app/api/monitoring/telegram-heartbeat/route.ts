import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { setUptimeCheckStatus } from "../../../../lib/monitoring/metrics";
import { withApiMonitoring } from "../../../../lib/monitoring/api";

function repoRoot() {
  return process.cwd();
}

function envInt(name: string, fallbackMs: number) {
  const raw = (process.env[name] ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallbackMs;
}

async function readHeartbeat() {
  const heartbeatPath = join(repoRoot(), "data", "telegram-heartbeat.json");
  const txt = await readFile(heartbeatPath, "utf-8");
  return JSON.parse(txt) as { updated_at?: string; reason?: string };
}

async function handler() {
  const maxAgeMs = envInt("TELEGRAM_HEARTBEAT_MAX_AGE_MS", 5 * 60 * 1000);
  try {
    const hb = await readHeartbeat();
    const updatedAt = hb?.updated_at ? new Date(hb.updated_at).getTime() : NaN;
    const ageMs = Number.isFinite(updatedAt) ? Date.now() - updatedAt : Number.POSITIVE_INFINITY;

    const status = ageMs <= maxAgeMs ? ("green" as const) : ("red" as const);
    const details =
      status === "green"
        ? `heartbeat ok (age ${Math.round(ageMs / 1000)}s)`
        : `heartbeat stale (age ${Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : "?"}s)`;

    await setUptimeCheckStatus("TelegramBot", status, `${details}${hb?.reason ? `; ${hb.reason}` : ""}`).catch(() => {});

    if (status === "red") {
      return NextResponse.json({ ok: false, service: "TelegramBot", status, details }, { status: 503 });
    }

    return NextResponse.json({ ok: true, service: "TelegramBot", status, details }, { status: 200 });
  } catch (e: any) {
    await setUptimeCheckStatus("TelegramBot", "red", `missing heartbeat file`).catch(() => {});
    return NextResponse.json({ ok: false, service: "TelegramBot", status: "red", details: "missing heartbeat file" }, { status: 503 });
  }
}

export const GET = withApiMonitoring({ route: "/api/monitoring/telegram-heartbeat", method: "GET", handler });

