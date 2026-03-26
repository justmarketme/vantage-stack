import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { setDatabaseSizeStatus, setUptimeCheckStatus } from "../../../../lib/monitoring/metrics";
import { sendTelegramAlert } from "../../../../lib/scheduler-engine/telegram";
import postgres from "postgres";

function env(name: string) {
  return (process.env[name] || "").trim();
}

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

async function fetchWithTimeout(url: string, ms: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal, cache: "no-store" });
    return res;
  } finally {
    clearTimeout(t);
  }
}

async function checkWebsite(url: string) {
  const res = await fetchWithTimeout(url, 8_000);
  return { ok: res.ok, status: res.status };
}

async function checkJsonOk(url: string) {
  const res = await fetchWithTimeout(url, 8_000);
  const json = await res.json().catch(() => ({}));
  return { httpOk: res.ok, ok: Boolean((json as any)?.ok), status: res.status, json };
}

async function checkDbSize() {
  const url = env("DATABASE_URL") || env("SCHEDULER_PG_URL") || env("WEEKLY_PG_URL") || env("BRIEFING_PG_URL");
  if (!url) return { ok: true, skipped: true as const };

  const db = postgres(url, { max: 1, prepare: false });
  try {
    const rows = (await db.unsafe("select pg_database_size(current_database())::bigint as bytes")) as Array<any>;
    const bytes = Number(rows?.[0]?.bytes ?? 0);
    const sizeMb = bytes / (1024 * 1024);
    const limitMb = 500;
    const warnMb = 400;
    const urgentMb = 450;

    if (sizeMb >= urgentMb) return { ok: true, skipped: false as const, status: "red" as const, sizeMb };
    if (sizeMb >= warnMb) return { ok: true, skipped: false as const, status: "yellow" as const, sizeMb };
    return { ok: true, skipped: false as const, status: "green" as const, sizeMb };
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
}

async function handler(req: Request) {
  const urlObj = new URL(req.url);
  const secret = env("CRON_SECRET");
  const provided = (urlObj.searchParams.get("secret") || "").trim();
  if (secret && provided !== secret) return unauthorized();

  const base = env("NEXT_PUBLIC_BASE_URL") || env("NEXT_PUBLIC_APP_URL") || "http://localhost:3005";
  const website = env("NEXT_PUBLIC_SITE_URL") || env("NEXT_PUBLIC_APP_URL") || base;

  const endpoints = {
    website,
    backend_health: `${base.replace(/\/+$/, "")}/api/health`,
    backend_health_deep: `${base.replace(/\/+$/, "")}/api/health?deep=1`,
    telegram_heartbeat: `${base.replace(/\/+$/, "")}/api/monitoring/telegram-heartbeat`,
  };

  const outcomes: Record<string, { status: "green" | "yellow" | "red" | "unknown"; details: string }> = {};

  // 1) Website
  try {
    const out = await checkWebsite(endpoints.website);
    const status = out.ok ? ("green" as const) : ("red" as const);
    await setUptimeCheckStatus("Website", status, `HTTP ${out.status}`);
    outcomes.Website = { status, details: `HTTP ${out.status}` };
  } catch (e: any) {
    await setUptimeCheckStatus("Website", "red", String(e?.message ?? e));
    outcomes.Website = { status: "red", details: String(e?.message ?? e) };
  }

  // 2) Backend API health
  try {
    const out = await checkJsonOk(endpoints.backend_health);
    const status = out.ok ? ("green" as const) : ("red" as const);
    await setUptimeCheckStatus("BackendAPI", status, `HTTP ${out.status}`);
    outcomes.BackendAPI = { status, details: `HTTP ${out.status}` };
  } catch (e: any) {
    await setUptimeCheckStatus("BackendAPI", "red", String(e?.message ?? e));
    outcomes.BackendAPI = { status: "red", details: String(e?.message ?? e) };
  }

  // 3) Supabase / database connection
  try {
    const out = await checkJsonOk(endpoints.backend_health_deep);
    const status = out.ok ? ("green" as const) : ("red" as const);
    const details = out.json?.db?.ok === false ? `db ping failed` : `HTTP ${out.status}`;
    await setUptimeCheckStatus("SupabaseDB", status, details);
    outcomes.SupabaseDB = { status, details };
  } catch (e: any) {
    await setUptimeCheckStatus("SupabaseDB", "red", String(e?.message ?? e));
    outcomes.SupabaseDB = { status: "red", details: String(e?.message ?? e) };
  }

  // 3.5) Database size (free tier: 500MB limit; warn 400MB; urgent 450MB)
  try {
    const out = await checkDbSize();
    if ((out as any).skipped) {
      await setUptimeCheckStatus("SupabaseDBSize", "unknown", "no DATABASE_URL configured");
      outcomes.SupabaseDBSize = { status: "unknown" as const, details: "skipped" };
    } else {
      const status = (out as any).status as "green" | "yellow" | "red";
      const sizeMb = (out as any).sizeMb as number;
      const limitMb = 500;
      const warnMb = 400;
      const urgentMb = 450;
      const label = status === "red" ? `URGENT >= ${urgentMb}MB` : status === "yellow" ? `WARNING >= ${warnMb}MB` : "OK";
      const details = `db size ${Math.round(sizeMb)}MB; ${label}`;
      await setUptimeCheckStatus("SupabaseDBSize", status, details);
      await setDatabaseSizeStatus({ status, details, size_mb: sizeMb, limit_mb: limitMb }).catch(() => {});
      if (status === "yellow") {
        await sendTelegramAlert({ text: `⚠️ DB size warning: ${Math.round(sizeMb)}MB (limit 500MB)` }).catch(() => {});
      }
      if (status === "red") {
        await sendTelegramAlert({ text: `🚨 DB size urgent: ${Math.round(sizeMb)}MB (limit 500MB)` }).catch(() => {});
      }
      outcomes.SupabaseDBSize = { status, details };
    }
  } catch (e: any) {
    await setUptimeCheckStatus("SupabaseDBSize", "red", String(e?.message ?? e));
    outcomes.SupabaseDBSize = { status: "red", details: String(e?.message ?? e) };
  }

  // 4) Telegram bot heartbeat (since you use polling, we can't reliably monitor Telegram webhook delivery)
  try {
    const res = await fetchWithTimeout(endpoints.telegram_heartbeat, 8_000);
    const status = res.ok ? ("green" as const) : ("red" as const);
    outcomes.TelegramBot = { status, details: `HTTP ${res.status}` };
  } catch (e: any) {
    outcomes.TelegramBot = { status: "red", details: String(e?.message ?? e) };
  }

  // Alerts: immediate for each failing service.
  const failing = Object.entries(outcomes).filter(([, v]) => v.status === "red");
  for (const [service, v] of failing) {
    await sendTelegramAlert({ text: `🚩 Uptime check failed: ${service}\n${v.details}` }).catch(() => {});
  }

  return NextResponse.json({ ok: true, outcomes, ts: new Date().toISOString() }, { status: 200 });
}

export const GET = withApiMonitoring({ route: "/api/cron/uptime-check", method: "GET", handler });

