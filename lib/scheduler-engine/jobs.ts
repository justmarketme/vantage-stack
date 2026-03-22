import crypto from "crypto";
import { connectSchedulerDb, ensureSchedulerTables, upsertSchedulerJobRunDb, closeSchedulerDb } from "./db";
import { appendJobRun } from "./storage";
import type { JobStatus, SchedulerJobRun } from "./types";

function isoNow() {
  return new Date().toISOString();
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function errObj(e: unknown): { message: string; stack?: string } {
  if (e instanceof Error) return { message: e.message, stack: e.stack };
  return { message: String(e) };
}

export async function recordJobRun(run: SchedulerJobRun) {
  const db = connectSchedulerDb();
  try {
    if (db) {
      await ensureSchedulerTables(db);
      await upsertSchedulerJobRunDb(db, run);
    } else {
      await appendJobRun(run);
    }
  } finally {
    if (db) await closeSchedulerDb(db);
  }
}

export async function runJobWithLogging<T>(params: {
  job_name: string;
  schedule: string;
  timezone: string;
  attempt: number;
  max_attempts: number;
  fn: () => Promise<{ status: JobStatus; summary: Record<string, unknown>; result?: T }>;
}): Promise<{ run: SchedulerJobRun; result?: T }> {
  const id = uid(`job_${params.job_name}`);
  const started_at = isoNow();

  const base: SchedulerJobRun = {
    id,
    job_name: params.job_name,
    started_at,
    status: "failed",
    schedule: params.schedule,
    timezone: params.timezone,
    attempt: params.attempt,
    max_attempts: params.max_attempts,
    summary: {},
  };

  await recordJobRun(base);

  try {
    const out = await params.fn();
    const finished_at = isoNow();
    const finalRun: SchedulerJobRun = {
      ...base,
      finished_at,
      status: out.status,
      summary: out.summary ?? {},
    };
    await recordJobRun(finalRun);
    return { run: finalRun, result: out.result };
  } catch (e) {
    const finished_at = isoNow();
    const finalRun: SchedulerJobRun = {
      ...base,
      finished_at,
      status: "failed",
      summary: {},
      error: errObj(e),
    };
    await recordJobRun(finalRun);
    throw e;
  }
}

export function shortHash(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

