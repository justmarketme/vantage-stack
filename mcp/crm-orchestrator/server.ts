#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { connectCrmDb, ensureCrmSchema } from "../../lib/crm/db";
import { performClientIntake } from "../../lib/crm/intake";
import { CrmClientIntakeSchema } from "../../lib/crm/crm-intake-schema";

const Empty = z.object({}).optional();

const server = new Server({ name: "crm-orchestrator", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "build-crm-dashboard", description: "Map CRM UI routes, components, and data dependencies.", inputSchema: zodToJsonSchema(Empty) },
    { name: "create-api-endpoints", description: "List CRM API routes and extension points.", inputSchema: zodToJsonSchema(Empty) },
    { name: "wire-data-flows", description: "Describe blueprint → intake → tasks → events pipeline.", inputSchema: zodToJsonSchema(Empty) },
    { name: "integrate-agent-outputs", description: "How research, delivery, and analytics write into CRM tables.", inputSchema: zodToJsonSchema(Empty) },
    { name: "build-pipeline-views", description: "Pipeline stages and GET /api/crm/pipeline contract.", inputSchema: zodToJsonSchema(Empty) },
    { name: "create-analytics-queries", description: "CRM revenue/funnel service entrypoints.", inputSchema: zodToJsonSchema(Empty) },
    { name: "sync-telegram-data", description: "Telegram bot + CRM Postgres alignment notes.", inputSchema: zodToJsonSchema(Empty) },
    { name: "design-ui-components", description: "Reusable CRM UI tokens (vs-card, FormField, status badges).", inputSchema: zodToJsonSchema(Empty) },
    { name: "manage-real-time-subscriptions", description: "Polling vs Supabase live queries for CRM dashboards.", inputSchema: zodToJsonSchema(Empty) },
    { name: "create-data-transformation-layers", description: "Intake validation, audit log, and event tracking.", inputSchema: zodToJsonSchema(Empty) },
    {
      name: "run-client-intake",
      description: "Validate and upsert a client via the same pipeline as POST /api/crm/client/intake (requires DATABASE_URL).",
      inputSchema: zodToJsonSchema(CrmClientIntakeSchema),
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;

  const staticOut = (body: Record<string, unknown>) => ({
    content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }],
  });

  if (name === "build-crm-dashboard") {
    return staticOut({
      ok: true,
      routes: ["/crm", "/crm/clients", "/crm/clients/new", "/crm/clients/[id]", "/crm/clients/[id]/edit"],
      components: ["components/crm/CrmSubnav.tsx", "components/crm/ClientQuestionnaireForm.tsx", "components/crm/statusStyles.ts"],
    });
  }
  if (name === "create-api-endpoints") {
    return staticOut({
      ok: true,
      endpoints: [
        "POST /api/crm/client/intake",
        "GET /api/crm/clients",
        "GET /api/crm/clients/:id",
        "PATCH /api/crm/clients/:id",
        "GET /api/crm/pipeline",
        "GET /api/crm/analytics/revenue",
        "GET /api/crm/analytics/funnel",
      ],
      lib: ["lib/crm/intake.ts", "lib/crm/client-update.ts", "lib/crm/service.ts"],
    });
  }
  if (name === "wire-data-flows") {
    return staticOut({
      ok: true,
      flow: [
        "Blueprint POST /api/blueprint/submit → performClientIntake (tasks + events)",
        "CRM manual POST /api/crm/client/intake → performClientIntake",
        "PATCH client website_url → triggerResearchAgent when RESEARCH_AGENT_WEBHOOK_URL set",
      ],
    });
  }
  if (name === "integrate-agent-outputs") {
    return staticOut({
      ok: true,
      tables: ["clients", "tasks", "reports", "events", "client_audit_log", "crm_activity"],
    });
  }
  if (name === "build-pipeline-views") {
    return staticOut({ ok: true, stages: ["blueprint-submitted", "report-sent", "proposal-sent", "active-client", "upsell-sent", "manually-added"] });
  }
  if (name === "create-analytics-queries") {
    return staticOut({ ok: true, functions: ["getCrmRevenueAnalytics", "getCrmFunnelAnalytics"], routes: ["/api/crm/analytics/revenue", "/api/crm/analytics/funnel"] });
  }
  if (name === "sync-telegram-data") {
    return staticOut({ ok: true, note: "telegram_command_log + crm_activity; bot uses same clients/tasks tables when TELEGRAM_PG_URL aligns." });
  }
  if (name === "design-ui-components") {
    return staticOut({ ok: true, primitives: ["vs-card", "vs-input", "vs-button-primary", "FormField", "font-heading / Inter"] });
  }
  if (name === "manage-real-time-subscriptions") {
    return staticOut({ ok: true, recommendation: "Short-interval SWR/refetch on CRM list; add Supabase channel later if needed." });
  }
  if (name === "create-data-transformation-layers") {
    return staticOut({ ok: true, layers: ["BlueprintSubmitSchema", "CrmClientIntakeSchema", "performClientIntake", "updateClientRecord + audit"] });
  }

  if (name === "run-client-intake") {
    const args = (req.params.arguments ?? {}) as unknown;
    const parsed = CrmClientIntakeSchema.safeParse(args);
    if (!parsed.success) {
      return staticOut({ ok: false, error: "validation", issues: parsed.error.issues });
    }
    const db = connectCrmDb();
    if (!db) return staticOut({ ok: false, error: "missing_database_url" });
    try {
      await ensureCrmSchema(db);
      const { company, intake_source, created_by, skip_research, jump_to_status, ...blueprint } = parsed.data;
      const out = await performClientIntake(db, blueprint, {
        source: intake_source,
        createdBy: created_by,
        company: company || undefined,
        skipResearch: skip_research,
        jumpToStatus: jump_to_status,
      });
      return staticOut(out as Record<string, unknown>);
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
