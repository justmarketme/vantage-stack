import postgres, { type Sql } from "postgres";
import type { SchedulerJobRun } from "./types";
import { sendTelegramAlert } from "./telegram";
import { setDatabaseStatus } from "../monitoring/metrics";
import * as Sentry from "@sentry/nextjs";

function env(name: string) {
  return (process.env[name] || "").trim();
}

export function getSchedulerDbUrl(): string | null {
  const url =
    env("SCHEDULER_PG_URL") ||
    env("WEEKLY_PG_URL") ||
    env("BRIEFING_PG_URL") ||
    env("REPORTS_PG_URL") ||
    env("DATABASE_URL");
  return url ? url : null;
}

export function connectSchedulerDb(): Sql | null {
  const url = getSchedulerDbUrl();
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

export async function ensureSchedulerTables(db: Sql) {
  await monitorQuery("ensureSchedulerTables", async () =>
    db.unsafe(`
    create table if not exists scheduler_job_runs (
      id text primary key,
      job_name text not null,
      started_at timestamptz not null,
      finished_at timestamptz,
      status text not null,
      schedule text,
      timezone text,
      attempt int not null,
      max_attempts int not null,
      summary jsonb not null,
      error jsonb
    );
    create index if not exists scheduler_job_runs_name_started_idx on scheduler_job_runs (job_name, started_at desc);
  `)
  );
}

export async function upsertSchedulerJobRunDb(db: Sql, run: SchedulerJobRun) {
  await monitorQuery("upsertSchedulerJobRunDb", async () => db`
    insert into scheduler_job_runs (
      id, job_name, started_at, finished_at, status,
      schedule, timezone, attempt, max_attempts, summary, error
    ) values (
      ${run.id},
      ${run.job_name},
      ${run.started_at},
      ${run.finished_at ?? null},
      ${run.status},
      ${run.schedule ?? null},
      ${run.timezone ?? null},
      ${run.attempt},
      ${run.max_attempts},
      ${run.summary as any},
      ${(run.error ?? null) as any}
    )
    on conflict (id) do update set
      finished_at = excluded.finished_at,
      status = excluded.status,
      summary = excluded.summary,
      error = excluded.error
  `);
}

export async function listLatestRunsByJob(db: Sql, jobNames: string[]) {
  if (!jobNames.length) return new Map<string, SchedulerJobRun>();
  const rows = await monitorQuery("listLatestRunsByJob", async () =>
    db.unsafe(
    `
    with ranked as (
      select
        *,
        row_number() over (partition by job_name order by started_at desc) as rn
      from scheduler_job_runs
      where job_name = any($1::text[])
    )
    select *
    from ranked
    where rn = 1
  `,
    [jobNames],
    )
  );

  const map = new Map<string, SchedulerJobRun>();
  for (const r of rows ?? []) {
    const job = String(r.job_name ?? "");
    if (!job) continue;
    map.set(job, {
      id: String(r.id),
      job_name: job,
      started_at: new Date(r.started_at).toISOString(),
      finished_at: r.finished_at ? new Date(r.finished_at).toISOString() : undefined,
      status: (String(r.status) as any) ?? "failed",
      schedule: r.schedule ? String(r.schedule) : undefined,
      timezone: r.timezone ? String(r.timezone) : undefined,
      attempt: Number(r.attempt ?? 1),
      max_attempts: Number(r.max_attempts ?? 3),
      summary: (r.summary ?? {}) as any,
      error: r.error ? (r.error as any) : undefined,
    });
  }
  return map;
}

export async function closeSchedulerDb(db: Sql) {
  await db.end({ timeout: 5 });
}

