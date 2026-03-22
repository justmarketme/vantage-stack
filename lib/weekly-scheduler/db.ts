import postgres, { type Sql } from "postgres";
import type { AutomationRunRecord } from "./types";
import { sendTelegramAlert } from "../scheduler-engine/telegram";
import { setDatabaseStatus } from "../monitoring/metrics";
import * as Sentry from "@sentry/nextjs";

function env(name: string) {
  return (process.env[name] || "").trim();
}

export function getDbUrl(): string | null {
  const url = env("WEEKLY_PG_URL") || env("BRIEFING_PG_URL");
  return url ? url : null;
}

export function connectDb(): Sql | null {
  const url = getDbUrl();
  if (!url) return null;
  return postgres(url, { max: 5, prepare: false });
}

async function monitorQuery<T>(label: string, fn: () => Promise<T>) {
  const started = Date.now();
  try {
    const out = await fn();
    const ms = Date.now() - started;
    if (ms > 1000) {
      await setDatabaseStatus("yellow", `slow query (${label}) ${ms}ms`).catch(() => {});
      await sendTelegramAlert({ text: `🚩 DB slow query: ${label} took ${ms}ms` }).catch(() => {});
    } else {
      await setDatabaseStatus("green", `db ok (${label}) ${ms}ms`).catch(() => {});
    }
    return out;
  } catch (e: any) {
    Sentry.captureException(e, {
      tags: { surface: "database", failure_type: "database", label },
    });
    await setDatabaseStatus("red", `db error (${label}): ${String(e?.message ?? e)}`).catch(() => {});
    throw e;
  }
}

export async function ensureWeeklyTables(db: Sql) {
  await monitorQuery("ensureWeeklyTables", async () =>
    db.unsafe(`
    create table if not exists automation_runs (
      id text primary key,
      started_at timestamptz not null,
      finished_at timestamptz,
      status text not null,
      cron_schedule text,
      cron_timezone text,
      summary jsonb not null,
      errors jsonb
    );
  `)
  );
}

export async function ensureReportsTable(db: Sql) {
  await monitorQuery("ensureReportsTable", async () =>
    db.unsafe(`
    create table if not exists reports (
      id text primary key,
      client_id text,
      client_name text,
      client_domain text,
      report_type text not null,
      report_generated boolean not null default false,
      created_at timestamptz not null,
      health_score int,
      source jsonb,
      report_markdown text
    );
    create index if not exists reports_client_created_idx on reports (client_id, created_at desc);
    create index if not exists reports_type_created_idx on reports (report_type, created_at desc);
  `)
  );
}

export async function insertAutomationRunDb(db: Sql, run: AutomationRunRecord) {
  await monitorQuery("insertAutomationRunDb", async () => db`
    insert into automation_runs (
      id, started_at, finished_at, status, cron_schedule, cron_timezone, summary, errors
    ) values (
      ${run.id},
      ${run.started_at},
      ${run.finished_at ?? null},
      ${run.status},
      ${run.cron?.schedule ?? null},
      ${run.cron?.timezone ?? null},
      ${run.summary as any},
      ${(run.errors ?? null) as any}
    )
    on conflict (id) do update set
      finished_at = excluded.finished_at,
      status = excluded.status,
      summary = excluded.summary,
      errors = excluded.errors
  `);
}

export async function closeDb(db: Sql) {
  await db.end({ timeout: 5 });
}

