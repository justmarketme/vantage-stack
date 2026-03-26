#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { sendTelegramAlert } from "../../lib/scheduler-engine/telegram";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");
const envExamplePath = join(repoRoot, ".env.example");
const vercelJsonPath = join(repoRoot, "vercel.json");

async function appendEnvExample(block: string) {
  const current = await readFile(envExamplePath, "utf-8").catch(() => "");
  if (current.includes(block.trim())) return { ok: true, updated: false };
  const next = current.trimEnd() + "\n\n" + block.trim() + "\n";
  await writeFile(envExamplePath, next, "utf-8");
  return { ok: true, updated: true };
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

const server = new Server({ name: "monitoring-engine", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "setup-error-tracking",
        description: "Ensure Sentry env keys exist in .env.example and cron digest is present.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "create-uptime-monitor",
        description: "Return the centralized uptime-check endpoint (runs every 5 minutes).",
        inputSchema: {
          type: "object",
          properties: {
            websiteUrl: { type: "string", description: "Main website URL (optional; defaults to NEXT_PUBLIC_APP_URL)." },
            telegramHeartbeatUrl: { type: "string", description: "Telegram bot heartbeat URL (optional; used by `/api/cron/uptime-check`)." },
          },
        },
      },
      {
        name: "configure-performance-alerts",
        description: "Confirm API performance thresholds and where enforced (warn >3s, alert >10s to Telegram).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "track-api-health",
        description: "Ensure cron health checks are configured in vercel.json (hourly third-party, daily Sentry digest).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "monitor-database-performance",
        description: "Describe DB health route usage and alert thresholds (ping + slow query guidance).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "send-alert-to-telegram",
        description: "Send a test alert to Telegram using env vars.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", description: "Message text to send." } },
          required: ["text"],
        },
      },
      {
        name: "generate-health-dashboard",
        description: "Return the CRM dashboard URLs and a quick interpretation guide.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  if (name === "setup-error-tracking") {
    const block = `
################################################################################
# Monitoring & Alerts (Sentry + Telegram + health checks)
################################################################################
SENTRY_DSN=
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_TRACES_SAMPLE_RATE=0.1
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0.1
SENTRY_AUTH_TOKEN=
SENTRY_ORG=
SENTRY_PROJECT=
NEXT_PUBLIC_BASE_URL=http://localhost:3005
`;
    const envOut = await appendEnvExample(block);
    const vercelOut = await upsertVercelCron({ path: "/api/cron/error-digest", schedule: "30 7 * * *" });
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, envOut, vercelOut }, null, 2) }] };
  }

  if (name === "create-uptime-monitor") {
    const websiteUrl = (typeof obj.websiteUrl === "string" ? obj.websiteUrl : "").trim() || (process.env.NEXT_PUBLIC_APP_URL || "").trim();
    const telegramHeartbeatUrl = (typeof obj.telegramHeartbeatUrl === "string" ? obj.telegramHeartbeatUrl : "").trim();
    const base = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "").trim();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              cadence: "5 minutes",
              cron_endpoint: "/api/cron/uptime-check",
              notes: [
                "This repo centralizes uptime monitoring via internal HTTP checks and sends Telegram alerts directly.",
                "Configure `NEXT_PUBLIC_SITE_URL` (optional) and ensure `NEXT_PUBLIC_BASE_URL` points to your running app.",
                "Telegram liveness is determined via `/api/monitoring/telegram-heartbeat` (works with polling bots).",
              ],
              example_values: { websiteUrl: websiteUrl || "(set websiteUrl)", telegramHeartbeatUrl: telegramHeartbeatUrl || "(optional)" },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "configure-performance-alerts") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              thresholds: { warn_ms: 3000, alert_ms: 10000 },
              enforcement: "lib/monitoring/api.ts (withApiMonitoring)",
              note: "Apply wrapper to route handlers to capture timings + alerting.",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "track-api-health") {
    const vercelOut = await upsertVercelCron({ path: "/api/cron/third-party-health", schedule: "0 * * * *" });
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, vercelOut }, null, 2) }] };
  }

  if (name === "monitor-database-performance") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              db_health: { endpoint: "/api/health?deep=1", alert_ms: 1000 },
              plan_limits: "Hook DB size checks to your Supabase plan limits (not auto-detected here).",
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "send-alert-to-telegram") {
    const text = typeof obj.text === "string" ? obj.text : "";
    const out = await sendTelegramAlert({ text });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "generate-health-dashboard") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              ok: true,
              dashboard_page: "/monitoring",
              dashboard_api: "/api/monitoring/dashboard",
              data_sources: ["API timings (instrumented routes)", "DB ping (/api/health?deep=1)", "3rd-party hourly cron"],
            },
            null,
            2
          ),
        },
      ],
    };
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

