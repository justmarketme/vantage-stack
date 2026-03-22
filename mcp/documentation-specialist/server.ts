#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..", "..");

async function ensureDir(absPath: string) {
  await mkdir(absPath, { recursive: true });
}

async function walkFiles(params: { rootAbs: string; include: (absPath: string) => boolean }) {
  const out: string[] = [];
  async function walk(dirAbs: string) {
    const entries = await readdir(dirAbs, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (e.name === "node_modules" || e.name === ".next" || e.name === "dist") continue;
      const abs = join(dirAbs, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile() && params.include(abs)) out.push(abs);
    }
  }
  await walk(params.rootAbs);
  return out.sort((a, b) => a.localeCompare(b));
}

function apiPathFromRouteFile(absRoutePath: string) {
  const rel = absRoutePath.slice(repoRoot.length + 1).replace(/\\/g, "/");
  // app/api/foo/bar/route.ts -> /api/foo/bar
  const m = rel.match(/^app\/api\/(.+)\/route\.ts$/);
  if (!m) return null;
  return `/api/${m[1]}`.replace(/\/+/g, "/");
}

function detectMethods(source: string): string[] {
  const methods: string[] = [];
  const candidates = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];
  for (const m of candidates) {
    const re = new RegExp(`export\\s+async\\s+function\\s+${m}\\s*\\(`);
    if (re.test(source)) methods.push(m);
  }
  return methods;
}

function openApiSkeleton(params: { title: string; version: string }) {
  return {
    openapi: "3.0.3",
    info: { title: params.title, version: params.version },
    servers: [{ url: "https://YOUR_DOMAIN_HERE" }],
    paths: {} as Record<string, any>,
    components: { schemas: {}, securitySchemes: {} },
  };
}

function defaultEndpointDoc(params: { path: string; method: string; notes?: string[] }) {
  const notes = params.notes?.length ? params.notes : undefined;
  return {
    summary: `${params.method} ${params.path}`,
    description: notes ? notes.join("\n") : undefined,
    responses: {
      "200": {
        description: "OK",
        content: { "application/json": { schema: { type: "object" }, examples: { example: { value: { ok: true } } } } },
      },
      "400": { description: "Bad Request" },
      "401": { description: "Unauthorized" },
      "500": { description: "Internal Server Error" },
    },
  };
}

const GenerateApiDocsInput = z.object({
  out_file: z.string().optional().default("docs/openapi.json"),
  title: z.string().optional().default("VantageStack API"),
  version: z.string().optional().default("0.1.0"),
});

const CreateUserGuidesInput = z.object({
  out_file: z.string().optional().default("docs/CRM_USER_GUIDE.md"),
});

const DocumentAgentWorkflowsInput = z.object({
  out_file: z.string().optional().default("docs/AGENT_WORKFLOWS.md"),
});

const GenerateOnboardingGuideInput = z.object({
  out_file: z.string().optional().default("docs/DEVELOPER_ONBOARDING.md"),
});

const CreateChangelogInput = z.object({
  out_file: z.string().optional().default("docs/CHANGELOG.md"),
  deployment_id: z.string().min(1),
  summary: z.string().min(1),
  added: z.array(z.string()).optional().default([]),
  fixed: z.array(z.string()).optional().default([]),
  changed: z.array(z.string()).optional().default([]),
});

const BuildDocsSiteInput = z.object({
  out_dir: z.string().optional().default("docs-site"),
  provider: z.enum(["mintlify"]).optional().default("mintlify"),
});

const server = new Server({ name: "documentation-specialist", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate-api-docs",
        description:
          "Generate OpenAPI (Swagger) JSON by scanning Next.js route handlers under app/api/**/route.ts.",
        inputSchema: zodToJsonSchema(GenerateApiDocsInput),
      },
      {
        name: "create-user-guides",
        description:
          "Generate a user guide for the internal CRM (clients, pipeline, manual reports, Telegram commands, dashboard, common errors).",
        inputSchema: zodToJsonSchema(CreateUserGuidesInput),
      },
      {
        name: "document-agent-workflows",
        description:
          "Generate agent workflow documentation for the MCP/agents in this repo, including a Mermaid flowchart connecting them.",
        inputSchema: zodToJsonSchema(DocumentAgentWorkflowsInput),
      },
      {
        name: "generate-onboarding-guide",
        description:
          "Generate a developer onboarding guide (local setup, tests, deploy, adding agents, API integrations).",
        inputSchema: zodToJsonSchema(GenerateOnboardingGuideInput),
      },
      {
        name: "create-changelog",
        description:
          "Append a deployment entry to docs/CHANGELOG.md (what changed/added/fixed). Designed to be called by CI after deploy.",
        inputSchema: zodToJsonSchema(CreateChangelogInput),
      },
      {
        name: "build-docs-site",
        description:
          "Scaffold a lightweight docs site structure (Mintlify-style) that can be hosted separately. Does not install dependencies.",
        inputSchema: zodToJsonSchema(BuildDocsSiteInput),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params ?? {};
  const obj = asObject(args) ?? {};

  if (name === "generate-api-docs") {
    const parsed = GenerateApiDocsInput.parse(obj);
    const apiRoot = join(repoRoot, "app", "api");
    const openapi = openApiSkeleton({ title: parsed.title, version: parsed.version });

    if (existsSync(apiRoot)) {
      const routeFiles = await walkFiles({
        rootAbs: apiRoot,
        include: (p) => p.replace(/\\/g, "/").endsWith("/route.ts"),
      });

      for (const abs of routeFiles) {
        const apiPath = apiPathFromRouteFile(abs);
        if (!apiPath) continue;
        const src = await readFile(abs, "utf-8");
        const methods = detectMethods(src);
        if (!methods.length) continue;

        const rel = abs.slice(repoRoot.length + 1).replace(/\\/g, "/");
        const notes: string[] = [`Source: \`${rel}\``];
        if (apiPath.startsWith("/api/cron/")) notes.push("Likely protected by `CRON_SECRET` query param.");

        openapi.paths[apiPath] = openapi.paths[apiPath] ?? {};
        for (const m of methods) {
          openapi.paths[apiPath][m.toLowerCase()] = defaultEndpointDoc({ path: apiPath, method: m, notes });
        }
      }
    }

    const outAbs = join(repoRoot, parsed.out_file);
    await ensureDir(dirname(outAbs));
    await writeFile(outAbs, JSON.stringify(openapi, null, 2) + "\n", "utf-8");
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, out_file: parsed.out_file }, null, 2) }] };
  }

  if (name === "create-user-guides") {
    const parsed = CreateUserGuidesInput.parse(obj);
    const body = `# VantageStack CRM User Guide

This guide covers day-to-day usage of the internal CRM and ops tooling.

## Client profiles
- View client status, contact email, and last active timestamp.
- Confirm a client is eligible for automation: \`status = active-client\` and \`last_active_at\` within 14 days.

## Pipeline view
- Use the pipeline to understand which automations ran and which deliverables were sent.
- If a report looks missing, check for duplicate-prevention (weekly reports dedupe by \`reports.source.week_of\`).

## Trigger reports manually
- Weekly performance: call \`GET /api/cron/weekly-reports?secret=... \`
- Health checks: call \`GET /api/health\` (if enabled)

## Telegram bot commands
- Confirm your internal bot is configured via \`TELEGRAM_BOT_TOKEN\` and \`TELEGRAM_CHAT_ID\`.
- Weekly automation posts a run summary (sent/failed counts and error count).

## Analytics dashboard
- Validate weekly report metrics against your campaign daily source rows (\`report_type='campaign-daily'\`).
- If CPL or revenue are blank, verify \`source.ad_spend_usd\` / \`source.revenue_attributed_usd\` are being populated.

## Common errors and fixes
- **Unauthorized cron**: missing/incorrect \`CRON_SECRET\` query param.
- **Email delivery failed**: check \`RESEND_API_KEY\` and \`RESEND_FROM_EMAIL\`.
- **No clients processed**: verify \`clients.status\` and \`clients.last_active_at\`.
`;

    const outAbs = join(repoRoot, parsed.out_file);
    await ensureDir(dirname(outAbs));
    await writeFile(outAbs, body.trim() + "\n", "utf-8");
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, out_file: parsed.out_file }, null, 2) }] };
  }

  if (name === "document-agent-workflows") {
    const parsed = DocumentAgentWorkflowsInput.parse(obj);
    const mcpRoot = join(repoRoot, "mcp");
    const readmes = existsSync(mcpRoot)
      ? await walkFiles({ rootAbs: mcpRoot, include: (p) => p.toLowerCase().endsWith("readme.md") })
      : [];

    const agents: Array<{ name: string; readme?: string }> = [];
    for (const abs of readmes) {
      const rel = abs.slice(repoRoot.length + 1).replace(/\\/g, "/");
      const m = rel.match(/^mcp\/([^/]+)\/README\.md$/i);
      if (!m) continue;
      const n = m[1]!;
      const md = await readFile(abs, "utf-8");
      agents.push({ name: n, readme: md });
    }

    const agentNames = agents.map((a) => a.name).sort((a, b) => a.localeCompare(b));

    const mermaid = `flowchart TD
  scheduler["Vercel Cron / Schedulers"] --> weekly["weekly-scheduler"]
  weekly --> delivery["delivery-coordinator"]
  weekly --> telegram["telegram-orchestrator"]
  weekly --> db["database-architect"]
  briefing["briefing-generator"] --> delivery
  reportgen["report-generator"] --> delivery
  research["research-orchestrator"] --> reportbuilder["report-builder"]
  reportbuilder --> reportgen
  documentation["documentation-specialist"] --> docs["Docs artifacts / docs-site"]
`;

    const body = `# Agent Workflows (MCP)

This doc summarizes what each agent/MCP does, and how they connect at a high level.

## Inventory
${agentNames.map((n) => `- \`${n}\``).join("\n")}

## How agents connect (high level)

\`\`\`mermaid
${mermaid.trim()}
\`\`\`

## Notes
- For deeper details, open each \`mcp/<agent>/README.md\`.
`;

    const outAbs = join(repoRoot, parsed.out_file);
    await ensureDir(dirname(outAbs));
    await writeFile(outAbs, body.trim() + "\n", "utf-8");
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, out_file: parsed.out_file }, null, 2) }] };
  }

  if (name === "generate-onboarding-guide") {
    const parsed = GenerateOnboardingGuideInput.parse(obj);
    const body = `# Developer Onboarding — VantageStack

## Local setup
1. Install Node.js (LTS).
2. Create \`.env.local\` (see \`.env.example\`).
3. Install deps: \`npm install\`
4. Run dev: \`npm run dev\`

## Tests / lint
- Lint: \`npm run lint\`

## Deploy
- Hosted on Vercel (see \`vercel.json\` for cron schedules).

## Add a new agent (MCP)
1. Create a new folder under \`mcp/<agent-name>\` with \`server.ts\` and \`README.md\`.
2. Implement tools using \`@modelcontextprotocol/sdk\` with stdio transport.
3. Add a \`package.json\` script \`mcp:<agent-name>\` mirroring existing scripts.

## Add a new API integration
- Keep secrets in env vars (never commit them).
- Prefer adding a thin wrapper in \`lib/\` and calling it from route handlers in \`app/api/\`.
`;

    const outAbs = join(repoRoot, parsed.out_file);
    await ensureDir(dirname(outAbs));
    await writeFile(outAbs, body.trim() + "\n", "utf-8");
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, out_file: parsed.out_file }, null, 2) }] };
  }

  if (name === "create-changelog") {
    const parsed = CreateChangelogInput.parse(obj);
    const outAbs = join(repoRoot, parsed.out_file);
    await ensureDir(dirname(outAbs));
    const now = new Date().toISOString();

    let current = "";
    if (existsSync(outAbs)) current = await readFile(outAbs, "utf-8");
    if (!current.trim()) current = "# Changelog\n\n";

    const section = [
      `## ${now.slice(0, 10)} — Deployment \`${parsed.deployment_id}\``,
      ``,
      parsed.summary.trim(),
      ``,
      parsed.added.length ? `### Added\n${parsed.added.map((s) => `- ${s}`).join("\n")}\n` : "",
      parsed.changed.length ? `### Changed\n${parsed.changed.map((s) => `- ${s}`).join("\n")}\n` : "",
      parsed.fixed.length ? `### Fixed\n${parsed.fixed.map((s) => `- ${s}`).join("\n")}\n` : "",
      ``,
    ]
      .filter(Boolean)
      .join("\n");

    const next = current.trimEnd() + "\n\n" + section.trim() + "\n";
    await writeFile(outAbs, next, "utf-8");
    return { content: [{ type: "text", text: JSON.stringify({ ok: true, out_file: parsed.out_file }, null, 2) }] };
  }

  if (name === "build-docs-site") {
    const parsed = BuildDocsSiteInput.parse(obj);
    const outDirAbs = join(repoRoot, parsed.out_dir);
    await ensureDir(outDirAbs);
    await ensureDir(join(outDirAbs, "docs"));

    const mintJsonAbs = join(outDirAbs, "mint.json");
    if (!existsSync(mintJsonAbs)) {
      const mint = {
        name: "VantageStack Docs",
        theme: "mint",
        navigation: [
          { group: "Getting Started", pages: ["index", "developer-onboarding"] },
          { group: "API", pages: ["openapi"] },
          { group: "Operations", pages: ["agent-workflows", "crm-user-guide", "changelog"] },
        ],
      };
      await writeFile(mintJsonAbs, JSON.stringify(mint, null, 2) + "\n", "utf-8");
    }

    const indexAbs = join(outDirAbs, "docs", "index.md");
    if (!existsSync(indexAbs)) {
      await writeFile(
        indexAbs,
        `---
title: VantageStack Docs
description: System documentation for VantageStack.
---

# VantageStack Docs

- Start with **Developer Onboarding**
- Then review **Agent Workflows**
- Use **OpenAPI** for endpoint details
`,
        "utf-8",
      );
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true, provider: parsed.provider, out_dir: parsed.out_dir }, null, 2),
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

