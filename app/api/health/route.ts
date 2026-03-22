import { NextResponse } from "next/server";
import postgres from "postgres";
import { setDatabaseStatus } from "../../../lib/monitoring/metrics";
import { withApiMonitoring } from "../../../lib/monitoring/api";
import * as Sentry from "@sentry/nextjs";

function env(name: string) {
  return (process.env[name] || "").trim();
}

async function deepDbCheck() {
  const url = env("DATABASE_URL") || env("SCHEDULER_PG_URL") || env("WEEKLY_PG_URL") || env("BRIEFING_PG_URL");
  if (!url) return { ok: true, skipped: true, reason: "No DATABASE_URL (or scheduler db url) configured" };

  const sql = postgres(url, { max: 1, prepare: false });
  const started = Date.now();
  try {
    await sql.unsafe("select 1 as ok");
    const ms = Date.now() - started;
    await setDatabaseStatus(ms > 1000 ? "yellow" : "green", `db ping ${ms}ms`).catch(() => {});
    return { ok: true, ms };
  } catch (e: any) {
    Sentry.captureException(e, { tags: { surface: "database", failure_type: "database", label: "health-deepDbCheck" } });
    await setDatabaseStatus("red", String(e?.message ?? e)).catch(() => {});
    return { ok: false, error: String(e?.message ?? e) };
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {});
  }
}

async function handler(request: Request) {
  const { searchParams } = new URL(request.url);
  const deep = (searchParams.get("deep") || "").trim() === "1";

  if (deep) {
    const db = await deepDbCheck();
    const status = db.ok ? 200 : 503;
    return NextResponse.json({ ok: db.ok, deep: true, db, ts: new Date().toISOString() }, { status });
  }

  return NextResponse.json({ ok: true, ts: new Date().toISOString() }, { status: 200 });
}

export const GET = withApiMonitoring({ route: "/api/health", method: "GET", handler });

