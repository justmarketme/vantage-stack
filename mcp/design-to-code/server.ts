#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { connectCrmDb, ensureCrmSchema } from "../../lib/crm/db";
import {
  buildDesignBriefMarkdown,
  buildMasterPrompt,
  buildReviewChecklistMarkdown,
  callClaudeMessages,
  getDesignToCode,
  planGithubClientBranch,
  planProductionDeploy,
  planStagingDeploy,
  revisionPromptBlock,
  runGenerateDesignBrief,
  slugifyClientName,
  upsertDesignToCode,
} from "../../lib/design-to-code";
import { aggregateFromClientDetail } from "../../lib/design-to-code/aggregate";
import type { DiscoverySnapshot } from "../../lib/design-to-code/types";
import { getClientDetail } from "../../lib/crm/service";

const GenerateBriefArgs = z.object({
  client_id: z.string().uuid(),
  discovery: z.record(z.unknown()).optional(),
  competitor_analysis: z.string().optional(),
});

const MasterPromptArgs = z.object({
  client_id: z.string().uuid(),
  design_brief_markdown: z.string().optional(),
});

const ClaudeArgs = z.object({
  client_id: z.string().uuid().optional(),
  system: z.string().optional(),
  user: z.string().min(1),
});

const GithubArgs = z.object({
  client_slug: z.string().min(1),
  repo: z.string().optional(),
});

const StagingArgs = z.object({
  client_slug: z.string().min(1),
});

const ProductionArgs = z.object({
  client_slug: z.string().min(1),
  custom_domain: z.string().optional(),
});

const ChecklistArgs = z.object({
  client_name: z.string().min(1),
});

const RevisionArgs = z.object({
  client_name: z.string().min(1),
  request: z.string().min(1),
  context_snippet: z.string().min(1),
});

const StoreUrlsArgs = z.object({
  client_id: z.string().uuid(),
  generated_code_url: z.string().optional(),
  staging_url: z.string().optional(),
  production_url: z.string().optional(),
  github_branch: z.string().optional(),
  status: z.string().optional(),
  version: z.string().optional(),
});

const server = new Server({ name: "design-to-code", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate-design-brief",
      description:
        "Aggregate CRM client profile (blueprint + notes) and return a full markdown design brief; optionally persist to client_design_to_code when DATABASE_URL is set.",
      inputSchema: zodToJsonSchema(GenerateBriefArgs),
    },
    {
      name: "create-master-prompt",
      description: "Build the code-generation master prompt from CRM data or from an explicit design brief markdown.",
      inputSchema: zodToJsonSchema(MasterPromptArgs),
    },
    {
      name: "call-claude-api",
      description: "Call Anthropic Messages API (requires ANTHROPIC_API_KEY).",
      inputSchema: zodToJsonSchema(ClaudeArgs),
    },
    {
      name: "store-code-in-github",
      description: "Return a branch name and manual Git steps; set DESIGN_TO_CODE_GITHUB_REPO for repo hints.",
      inputSchema: zodToJsonSchema(GithubArgs),
    },
    {
      name: "deploy-to-staging",
      description: "Compute staging URL from DESIGN_TO_CODE_STAGING_BASE and client slug.",
      inputSchema: zodToJsonSchema(StagingArgs),
    },
    {
      name: "generate-review-checklist",
      description: "Markdown client review checklist for CRM.",
      inputSchema: zodToJsonSchema(ChecklistArgs),
    },
    {
      name: "handle-revisions",
      description: "Build a revision prompt block for Claude/Cursor from client feedback + code context.",
      inputSchema: zodToJsonSchema(RevisionArgs),
    },
    {
      name: "deploy-to-production",
      description: "Compute production URL (custom domain or path under DESIGN_TO_CODE_PRODUCTION_BASE).",
      inputSchema: zodToJsonSchema(ProductionArgs),
    },
    {
      name: "persist-dtc-record",
      description: "Upsert URLs/status/version into client_design_to_code for a client UUID.",
      inputSchema: zodToJsonSchema(StoreUrlsArgs),
    },
  ],
}));

function json(body: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }] };
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as unknown;

  if (name === "generate-design-brief") {
    const parsed = GenerateBriefArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    const db = await connectCrmDb();
    if (!db) return json({ ok: false, error: "missing_database_url" });
    try {
      await ensureCrmSchema(db);
      const out = await runGenerateDesignBrief(db, parsed.data.client_id, {
        discovery: parsed.data.discovery as DiscoverySnapshot | undefined,
        competitor_analysis: parsed.data.competitor_analysis,
      });
      if (!out.ok) return json({ ok: false, error: out.error });
      return json({ ok: true, ...out });
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  if (name === "create-master-prompt") {
    const parsed = MasterPromptArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    const db = await connectCrmDb();
    if (!db) return json({ ok: false, error: "missing_database_url" });
    try {
      await ensureCrmSchema(db);
      const { client_id, design_brief_markdown } = parsed.data;
      const detail = await getClientDetail(db, client_id);
      if (!detail.ok) return json({ ok: false, error: "not_found" });
      const existing = await getDesignToCode(db, client_id);
      const discovery = (existing?.discovery_snapshot ?? {}) as DiscoverySnapshot;
      const profile = detail.profile as Record<string, unknown>;
      const notes = (detail.notes ?? []) as { body?: string }[];
      const ctx = aggregateFromClientDetail(
        client_id,
        profile,
        notes,
        discovery,
        existing?.competitor_analysis?.trim() || "",
        typeof detail.health_score === "number" ? detail.health_score : null,
      );
      const brief = design_brief_markdown?.trim() || buildDesignBriefMarkdown(ctx);
      const master = buildMasterPrompt(brief, ctx);
      return json({ ok: true, design_brief_markdown: brief, master_prompt: master });
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  if (name === "call-claude-api") {
    const parsed = ClaudeArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    const system =
      parsed.data.system?.trim() ||
      "You are a principal Next.js engineer. Be thorough and production-minded.";
    const out = await callClaudeMessages(system, parsed.data.user);
    return json({ ok: out.ok, ...(out.ok ? out : { error: out.error }) });
  }

  if (name === "store-code-in-github") {
    const parsed = GithubArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    return json(planGithubClientBranch(parsed.data.client_slug, parsed.data.repo));
  }

  if (name === "deploy-to-staging") {
    const parsed = StagingArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    return json(planStagingDeploy(parsed.data.client_slug));
  }

  if (name === "generate-review-checklist") {
    const parsed = ChecklistArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    return json({ ok: true, markdown: buildReviewChecklistMarkdown(parsed.data.client_name) });
  }

  if (name === "handle-revisions") {
    const parsed = RevisionArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    return json({
      ok: true,
      revision_prompt: revisionPromptBlock(parsed.data.client_name, parsed.data.request, parsed.data.context_snippet),
    });
  }

  if (name === "deploy-to-production") {
    const parsed = ProductionArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    return json(planProductionDeploy(parsed.data.client_slug, parsed.data.custom_domain));
  }

  if (name === "persist-dtc-record") {
    const parsed = StoreUrlsArgs.safeParse(args);
    if (!parsed.success) return json({ ok: false, error: "validation", issues: parsed.error.issues });
    const db = await connectCrmDb();
    if (!db) return json({ ok: false, error: "missing_database_url" });
    try {
      await ensureCrmSchema(db);
      const { client_id, ...patch } = parsed.data;
      await upsertDesignToCode(db, client_id, patch);
      const row = await getDesignToCode(db, client_id);
      return json({ ok: true, design_to_code: row });
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  return json({ ok: false, error: "unknown_tool", name });
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
