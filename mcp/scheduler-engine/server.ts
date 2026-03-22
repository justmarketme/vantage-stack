#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { nextRunUtcFromCron } from "../../lib/scheduler-engine/cron";
import { connectSchedulerDb, ensureSchedulerTables, listLatestRunsByJob, closeSchedulerDb } from "../../lib/scheduler-engine/db";
import { listJobRuns } from "../../lib/scheduler-engine/storage";
import type { SchedulerJobRun } from "../../lib/scheduler-engine/types";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const vercelJsonPath = join(repoRoot, "vercel.json");
const dataDir = join(repoRoot, "data");
const configPath = join(dataDir, "scheduler-config.json");

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const txt = await readFile(path, "utf-8");
    return JSON.parse(txt) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, value: unknown) {
  await ensureDataDir();
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

async function getTimezone(): Promise<string> {
  const cfg = await readJsonFile<{ timezone?: string }>(configPath, {});
  return (cfg.timezone || "UTC").trim() || "UTC";
}

async function setTimezone(tz: string) {
  const next = { timezone: (tz || "UTC").trim() || "UTC" };
  await writeJsonFile(configPath, next);
  return next;
}

async function upsertVercelCron(params: { path: string; schedule: string }) {
  const cronEntry = { path: params.path, schedule: params.schedule };
  let current: any = {};
  try {
    current = JSON.parse(await readFile(vercelJsonPath, "utf-8"));
  } catch {
    current = {};
  }

  const crons: any[] = Array.isArray(current.crons) ? current.crons : [];
  const idx = crons.findIndex((c) => c?.path === cronEntry.path);
  if (idx >= 0) crons[idx] = cronEntry;
  else crons.push(cronEntry);

  const next = { ...current, crons };
  await writeFile(vercelJsonPath, JSON.stringify(next, null, 2) + "\n", "utf-8");
  return next;
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

async function monitor() {
  const tz = await getTimezone();
  const vercelTxt = await readFile(vercelJsonPath, "utf-8").catch(() => "{}");
  const vercel = (() => {
    try {
      return JSON.parse(vercelTxt);
    } catch {
      return {};
    }
  })();

  const crons = Array.isArray(vercel?.crons) ? vercel.crons : [];
  const jobsBase = crons
    .map((c: any) => ({
      name: jobNameForPath(String(c?.path ?? "")),
      path: String(c?.path ?? ""),
      schedule: String(c?.schedule ?? ""),
    }))
    .filter((j: any) => j.path && j.schedule);

  const names = jobsBase.map((j: any) => j.name);
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

  const jobs = jobsBase.map((j: any) => {
    const next = nextRunUtcFromCron(j.schedule, new Date());
    const last = db ? (latestByName.get(j.name) ?? null) : pickLatestFromList(fallbackRuns, j.name);
    return {
      ...j,
      timezone: tz,
      next_run_utc: next ? next.toISOString() : null,
      last_run: last,
    };
  });

  return { ok: true, timezone: tz, jobs };
}

const server = new Server({ name: "scheduler-engine", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "set-timezone",
        description: "Set scheduler timezone (stored in data/scheduler-config.json). Use UTC for consistency.",
        inputSchema: {
          type: "object",
          properties: { timezone: { type: "string", description: "Timezone label, e.g. UTC." } },
          required: ["timezone"],
        },
      },
      {
        name: "create-cron-job",
        description: "Upsert a Vercel Cron job entry in vercel.json.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "API path to call (e.g. /api/cron/research-batch)." },
            schedule: { type: "string", description: "Cron schedule (5-field, Vercel format; UTC)." },
          },
          required: ["path", "schedule"],
        },
      },
      {
        name: "schedule-research-batch",
        description: "Ensure daily research batch cron exists (02:00 UTC).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "schedule-morning-briefing",
        description: "Ensure daily morning briefing cron exists (07:15 South Africa == 05:15 UTC).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "schedule-weekly-reports",
        description: "Ensure weekly reports cron exists (Tue 08:00 UTC).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "monitor-job-execution",
        description: "Return a dashboard snapshot of all scheduled jobs (next run + last execution status).",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  if (name === "set-timezone") {
    const tz = typeof obj.timezone === "string" ? obj.timezone : "UTC";
    const out = await setTimezone(tz);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "create-cron-job") {
    const path = typeof obj.path === "string" ? obj.path : "";
    const schedule = typeof obj.schedule === "string" ? obj.schedule : "";
    const out = await upsertVercelCron({ path, schedule });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "schedule-research-batch") {
    const out = await upsertVercelCron({ path: "/api/cron/research-batch", schedule: "0 2 * * *" });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "schedule-morning-briefing") {
    const out = await upsertVercelCron({ path: "/api/cron/morning-briefing", schedule: "15 5 * * *" });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "schedule-weekly-reports") {
    const out = await upsertVercelCron({ path: "/api/cron/weekly-reports", schedule: "0 8 * * 2" });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "monitor-job-execution") {
    const out = await monitor();
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

