#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { connectDb, ensureReportsTable, ensureWeeklyTables } from "../../lib/weekly-scheduler/db";
import { buildWeeklyEmail } from "../../lib/weekly-scheduler/email";
import { sendWeeklyEmail } from "../../lib/weekly-scheduler/delivery";
import { computeWeeklyMetrics, listActiveClients, utcWindow } from "../../lib/weekly-scheduler/weekly";
import { runWeeklyPipeline } from "../../lib/weekly-scheduler/pipeline";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const vercelJsonPath = join(repoRoot, "vercel.json");

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

const server = new Server(
  { name: "weekly-scheduler", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "trigger-research-agent",
        description: "Query Postgres for active clients (status='active-client', active in last 14 days).",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "trigger-report-generator",
        description: "Generate the weekly performance email HTML for one client_id.",
        inputSchema: {
          type: "object",
          properties: {
            client_id: { type: "string", description: "Client id." },
            client_name: { type: "string", description: "Client display name." },
          },
          required: ["client_id", "client_name"],
        },
      },
      {
        name: "trigger-delivery",
        description: "Send the weekly performance email via Resend.",
        inputSchema: {
          type: "object",
          properties: {
            to: { type: "string", description: "Recipient email." },
            subject: { type: "string", description: "Email subject." },
            html: { type: "string", description: "Email HTML body." },
          },
          required: ["to", "subject", "html"],
        },
      },
      {
        name: "schedule-cron-job",
        description: "Write/update Vercel cron config (vercel.json) for weekly automation.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "API path to call (e.g. /api/cron/weekly-reports)." },
            schedule: { type: "string", description: "Cron schedule (Vercel format)." },
          },
          required: ["path", "schedule"],
        },
      },
      {
        name: "log-automation-run",
        description: "Append an automation run record to data/automation_runs.json.",
        inputSchema: {
          type: "object",
          properties: { run: { type: "object", description: "Run record to append." } },
          required: ["run"],
        },
      },
      {
        name: "run-weekly-pipeline",
        description:
          "Run the full weekly pipeline: query active clients, compute 7d metrics + WoW, send Resend emails, store reports rows, and send Telegram summary.",
        inputSchema: {
          type: "object",
          properties: { schedule: { type: "string", description: "Cron schedule for logging.", default: "0 8 * * 2" } },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  if (name === "trigger-research-agent") {
    const db = connectDb();
    if (!db) throw new Error("WEEKLY_PG_URL (or BRIEFING_PG_URL) is required.");
    try {
      await ensureWeeklyTables(db);
      await ensureReportsTable(db);
      const clients = await listActiveClients(db);
      return { content: [{ type: "text", text: JSON.stringify({ clients }, null, 2) }] };
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  if (name === "trigger-report-generator") {
    const client_id = typeof obj.client_id === "string" ? obj.client_id : "";
    const client_name = typeof obj.client_name === "string" ? obj.client_name : "Client";
    const db = connectDb();
    if (!db) throw new Error("WEEKLY_PG_URL (or BRIEFING_PG_URL) is required.");
    try {
      await ensureWeeklyTables(db);
      await ensureReportsTable(db);
      const week = utcWindow(7, new Date());
      const prev_week = utcWindow(7, new Date(new Date(week.since_iso).getTime()));
      const metrics = await computeWeeklyMetrics({ db, client_id, week, prev_week });
      const { subject, html } = buildWeeklyEmail({ client_name, metrics });
      return { content: [{ type: "text", text: JSON.stringify({ subject, html, metrics }, null, 2) }] };
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  if (name === "trigger-delivery") {
    const to = typeof obj.to === "string" ? obj.to : "";
    const subject = typeof obj.subject === "string" ? obj.subject : "";
    const html = typeof obj.html === "string" ? obj.html : "";
    const out = await sendWeeklyEmail({ to, subject, html });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "schedule-cron-job") {
    const path = typeof obj.path === "string" ? obj.path : "";
    const schedule = typeof obj.schedule === "string" ? obj.schedule : "";
    const out = await upsertVercelCron({ path, schedule });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "log-automation-run") {
    // Weekly pipeline logs to Postgres automation_runs. This tool exists for compatibility only.
    const run = asObject(obj.run) ?? {};
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, ignored: true, run }, null, 2) }] };
  }

  if (name === "run-weekly-pipeline") {
    const schedule = typeof obj.schedule === "string" ? obj.schedule : "0 8 * * 2";
    const out = await runWeeklyPipeline({ schedule });
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

