#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { connectAnalyticsDb, ensureAnalyticsTables } from "../../lib/analytics/db";
import {
  analyzeFunnel,
  calculateBusinessMetrics,
  generateRevenueChartData,
  trackClientEvent,
  exportAnalyticsReport,
} from "../../lib/analytics/engine-v2";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const TrackClientEventsInput = z.object({
  client_id: z.string().min(1),
  event_type: z.enum([
    "blueprint_submitted",
    "report_generated",
    "report_sent",
    "proposal_sent",
    "proposal_accepted",
    "client_activated",
    "upsell_sent",
    "upsell_accepted",
  ]),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

const DateRangeInput = z.object({
  start_date: z.string().optional(), // ISO date (YYYY-MM-DD) or ISO datetime
  end_date: z.string().optional(),
});

const RevenueChartsInput = DateRangeInput.extend({
  granularity: z.enum(["day", "week", "month"]).optional(),
});

const ExportReportsInput = DateRangeInput.extend({
  format: z.enum(["csv", "pdf"]),
});

const server = new Server({ name: "analytics-engine", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "track-client-events",
        description: "Insert a client-journey event into public.events.",
        inputSchema: zodToJsonSchema(TrackClientEventsInput),
      },
      {
        name: "calculate-business-metrics",
        description: "Calculate business KPIs for the given date range (defaults to last 30 days).",
        inputSchema: zodToJsonSchema(DateRangeInput),
      },
      {
        name: "generate-revenue-charts",
        description: "Generate chart-ready datasets for revenue and forecasting.",
        inputSchema: zodToJsonSchema(RevenueChartsInput),
      },
      {
        name: "analyze-funnel-conversion",
        description: "Analyze the pipeline funnel step counts + conversion rates.",
        inputSchema: zodToJsonSchema(DateRangeInput),
      },
      {
        name: "export-reports",
        description: "Export analytics charts/metrics as CSV or a basic PDF summary.",
        inputSchema: zodToJsonSchema(ExportReportsInput),
      },
      {
        name: "build-analytics-dashboard",
        description: "Return where to find the analytics dashboard in the app.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  const db = connectAnalyticsDb();
  try {
    if (!db) throw new Error("Missing database URL. Set DATABASE_URL (preferred) or SUPABASE_DB_URL.");
    await ensureAnalyticsTables(db);

    if (name === "track-client-events") {
      const parsed = TrackClientEventsInput.parse(obj);
      const out = await trackClientEvent(db, parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "calculate-business-metrics") {
      const parsed = DateRangeInput.parse(obj);
      const out = await calculateBusinessMetrics(db, parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "generate-revenue-charts") {
      const parsed = RevenueChartsInput.parse(obj);
      const out = await generateRevenueChartData(db, parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "analyze-funnel-conversion") {
      const parsed = DateRangeInput.parse(obj);
      const out = await analyzeFunnel(db, parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "export-reports") {
      const parsed = ExportReportsInput.parse(obj);
      const out = await exportAnalyticsReport(db, parsed);
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    if (name === "build-analytics-dashboard") {
      const out = {
        ok: true,
        dashboard_routes: ["/analytics"],
        api_routes: ["/api/analytics/track-event", "/api/analytics/metrics", "/api/analytics/charts", "/api/analytics/funnel", "/api/analytics/export"],
        note: "Ensure migrations have been applied so public.events exists.",
      };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } finally {
    if (db) await db.end({ timeout: 5 });
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

