import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { connectSchedulerDb, ensureSchedulerTables, listLatestRunsByJob, closeSchedulerDb } from "../../../../lib/scheduler-engine/db";
import { listJobRuns } from "../../../../lib/scheduler-engine/storage";
import { nextRunUtcFromCron } from "../../../../lib/scheduler-engine/cron";
import type { DashboardJob, SchedulerJobRun } from "../../../../lib/scheduler-engine/types";
import { withApiMonitoring } from "../../../../lib/monitoring/api";

const vercelJsonPath = join(process.cwd(), "vercel.json");

function tz() {
  return "UTC";
}

function safeJsonParse(txt: string): any {
  try {
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

function jobNameForPath(path: string) {
  if (path === "/api/cron/research-batch") return "research-batch";
  if (path === "/api/cron/morning-briefing") return "morning-briefing";
  if (path === "/api/cron/weekly-reports") return "weekly-reports";
  return path.replace(/^\/+/, "").replace(/[^\w-]+/g, "-");
}

function pickLatestFromList(runs: SchedulerJobRun[], jobName: string): SchedulerJobRun | null {
  return runs.find((r) => r.job_name === jobName) ?? null;
}

async function handler() {
  const vercelTxt = await readFile(vercelJsonPath, "utf-8").catch(() => "{}");
  const vercel = safeJsonParse(vercelTxt);
  const crons = Array.isArray(vercel?.crons) ? vercel.crons : [];

  const jobsBase: Array<{ name: string; path: string; schedule: string }> = crons
    .map((c: any) => ({
      name: jobNameForPath(String(c?.path ?? "")),
      path: String(c?.path ?? ""),
      schedule: String(c?.schedule ?? ""),
    }))
    .filter((j: { path: string; schedule: string }) => j.path && j.schedule);

  const names = jobsBase.map((j) => j.name);

  const db = connectSchedulerDb();
  let latestByName = new Map<string, SchedulerJobRun>();
  let fallbackRuns: SchedulerJobRun[] = [];

  try {
    if (db) {
      await ensureSchedulerTables(db);
      latestByName = await listLatestRunsByJob(db, names);
    } else {
      fallbackRuns = await listJobRuns(500);
    }
  } finally {
    if (db) await closeSchedulerDb(db);
  }

  const jobs: DashboardJob[] = jobsBase.map((j) => {
    let next: Date | null = null;
    try {
      next = nextRunUtcFromCron(j.schedule, new Date());
    } catch {
      // Parser only supports * and single numbers; schedules like */5 throw
    }
    const last = db ? (latestByName.get(j.name) ?? null) : pickLatestFromList(fallbackRuns, j.name);
    return {
      name: j.name,
      path: j.path,
      schedule: j.schedule,
      timezone: tz(),
      next_run_utc: next ? next.toISOString() : null,
      last_run: last,
    };
  });

  return NextResponse.json({ ok: true, timezone: tz(), jobs });
}

export const GET = withApiMonitoring({ route: "/api/scheduler/dashboard", method: "GET", handler });

