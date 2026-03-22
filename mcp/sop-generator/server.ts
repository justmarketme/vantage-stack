#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { SopVersionStatus } from "../../lib/sop/schema";
import { SopProjectBriefSchema } from "../../lib/sop/schema";
import { connectSopDb, ensureSopTables, getSopProjectById, createSopVersionSuggestion, setSopProjectVersionAndStatus } from "../../lib/sop/db";
import {
  createSopFromBriefAndSyncToBackend,
  analyzeSopEffectivenessForProject,
  researchAlternativeTools,
  generateImprovementSuggestions,
} from "../../lib/sop/workflows";
import { createNotionWorkspaceForSop, writeNotionPagesUnderRoot } from "../../lib/sop/notion";
import { createLocalFigmaArtifacts, generateMermaidDiagrams } from "../../lib/sop/diagrams";
import { generateDeploymentChecklist } from "../../lib/sop/checklist";

const SyncToBackendInput = z.object({
  brief: SopProjectBriefSchema,
  // Optional: if you want to force status after creation.
  status: z.enum(["draft", "active"]).optional(),
});

const CreateNotionDatabaseInput = z.object({
  brief: SopProjectBriefSchema,
  rootTitle: z.string().optional(),
});

const WriteNotionPagesInput = z.object({
  notion_root_page_id: z.string(),
  sections: z.array(
    z.object({
      title: z.string(),
      markdown: z.string(),
    }),
  ),
});

const CreateFigmaFileInput = z.object({
  project_id: z.string(),
  brief: SopProjectBriefSchema,
});

const DrawArchitectureDiagramInput = z.object({
  brief: SopProjectBriefSchema,
});

const GenerateChecklistInput = z.object({
  brief: SopProjectBriefSchema,
});

const UpdateSopVersionInput = z.object({
  project_id: z.string(),
  version_number: z.number(),
  change_description: z.string(),
  changed_by: z.string(),
  which_pages_changed: z.any().optional(),
  before_snapshot: z.any().optional(),
  after_snapshot: z.any().optional(),
  status: z.enum(["suggested", "approved", "in_progress", "implemented"]).optional(),
  implementation_status: z.enum(["suggested", "approved", "in_progress", "implemented"]).optional(),
});

const AnalyzeSopEffectivenessInput = z.object({
  project_id: z.string(),
  days: z.number().int().min(1).max(90).optional(),
});

const ResearchAlternativeToolsInput = z.object({
  tool_names: z.array(z.string()).min(1),
});

const GenerateImprovementSuggestionsInput = z.object({
  project_id: z.string(),
  // Optional override if you already computed analysis elsewhere.
  days: z.number().int().min(1).max(90).optional(),
  tool_names: z.array(z.string()).optional(),
});

function jsonResponse(content: any) {
  return { content: [{ type: "text", text: JSON.stringify(content, null, 2) }] };
}

async function withSopDb<T>(fn: (db: any) => Promise<T>) {
  const db = connectSopDb();
  if (!db) throw new Error("SOP DB connection missing. Set SOP_PG_URL or DATABASE_URL.");
  await ensureSopTables(db);
  try {
    const out = await fn(db);
    return out;
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
}

async function main() {
  const server = new Server({ name: "sop-generator", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "create-notion-database",
          description: "Create the Notion SOP workspace and pages (best-effort).",
          inputSchema: { type: "object", properties: { brief: { type: "object" }, rootTitle: { type: "string" } } },
        },
        {
          name: "write-notion-pages",
          description: "Write/refresh SOP pages under an existing Notion root page.",
          inputSchema: { type: "object", properties: { notion_root_page_id: { type: "string" }, sections: { type: "array" } }, required: ["notion_root_page_id", "sections"] },
        },
        {
          name: "create-figma-file",
          description: "Generate diagram artifacts for SOP (Figma REST file creation is best-effort).",
          inputSchema: { type: "object", properties: { project_id: { type: "string" }, brief: { type: "object" } }, required: ["project_id", "brief"] },
        },
        {
          name: "draw-architecture-diagram",
          description: "Generate diagram sources (Mermaid code) for system overview, DB schema, and flowchart.",
          inputSchema: { type: "object", properties: { brief: { type: "object" } }, required: ["brief"] },
        },
        {
          name: "generate-checklist",
          description: "Generate a deployment/checklist artifact from the brief.",
          inputSchema: { type: "object", properties: { brief: { type: "object" } }, required: ["brief"] },
        },
        {
          name: "sync-to-backend",
          description: "Create initial SOP, then persist to Supabase (sop_projects/sop_versions).",
          inputSchema: { type: "object", properties: { brief: { type: "object" }, status: { type: "string" } }, required: ["brief"] },
        },
        {
          name: "update-sop-version",
          description: "Write a new SOP version audit row and optionally update the current project version/status.",
          inputSchema: { type: "object", properties: { project_id: { type: "string" }, version_number: { type: "number" }, change_description: { type: "string" }, changed_by: { type: "string" }, status: { type: "string" } }, required: ["project_id", "version_number", "change_description", "changed_by"] },
        },
        {
          name: "analyze-sop-effectiveness",
          description: "Summarize SOP effectiveness from daily KPI metrics stored in Supabase.",
          inputSchema: { type: "object", properties: { project_id: { type: "string" }, days: { type: "number" } }, required: ["project_id"] },
        },
        {
          name: "research-alternative-tools",
          description: "Research alternatives for tools (best-effort static mapping; extend with real research).",
          inputSchema: { type: "object", properties: { tool_names: { type: "array", items: { type: "string" } } }, required: ["tool_names"] },
        },
        {
          name: "generate-improvement-suggestions",
          description: "Generate ranked improvement suggestions from analysis and tool alternatives.",
          inputSchema: { type: "object", properties: { project_id: { type: "string" }, days: { type: "number" }, tool_names: { type: "array" } }, required: ["project_id"] },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params?.name;
    const args = (req.params?.arguments ?? {}) as any;

    try {
      if (name === "sync-to-backend") {
        const parsed = SyncToBackendInput.parse(args ?? {});
        const out = await createSopFromBriefAndSyncToBackend(parsed.brief);

        // Optional status override.
        if (parsed.status && out.project_id) {
          await withSopDb(async (db) => {
            await setSopProjectVersionAndStatus(db, { project_id: out.project_id, version_number: out.sop_version ?? 1.0, status: parsed.status });
          });
        }

        return jsonResponse(out);
      }

      if (name === "create-notion-database") {
        const parsed = CreateNotionDatabaseInput.parse(args ?? {});
        const sections = (await import("../../lib/sop/generate/initialSop")).generateInitialSopSections(parsed.brief);

        const rootTitle = parsed.rootTitle ?? `SOP - ${parsed.brief.client_name} / ${parsed.brief.project_name}`;
        const notion = await createNotionWorkspaceForSop({ brief: parsed.brief, rootTitle, sections });
        return jsonResponse(notion);
      }

      if (name === "write-notion-pages") {
        const parsed = WriteNotionPagesInput.parse(args ?? {});
        const mapping = await writeNotionPagesUnderRoot({ rootPageId: parsed.notion_root_page_id, sections: parsed.sections });
        return jsonResponse(mapping);
      }

      if (name === "create-figma-file") {
        const parsed = CreateFigmaFileInput.parse(args ?? {});
        const out = await createLocalFigmaArtifacts({ project_id: parsed.project_id, brief: parsed.brief });
        return jsonResponse(out);
      }

      if (name === "draw-architecture-diagram") {
        const parsed = DrawArchitectureDiagramInput.parse(args ?? {});
        const out = generateMermaidDiagrams(parsed.brief);
        return jsonResponse(out);
      }

      if (name === "generate-checklist") {
        const parsed = GenerateChecklistInput.parse(args ?? {});
        const out = generateDeploymentChecklist(parsed.brief);
        return jsonResponse(out);
      }

      if (name === "update-sop-version") {
        const parsed = UpdateSopVersionInput.parse(args ?? {});
        const status = (parsed.status ?? "suggested") as SopVersionStatus;
        const version = await withSopDb(async (db) => {
          const row = await createSopVersionSuggestion(db, {
            project_id: parsed.project_id,
            version_number: parsed.version_number,
            change_description: parsed.change_description,
            changed_by: parsed.changed_by,
            which_pages_changed: parsed.which_pages_changed ?? [],
            before_snapshot: parsed.before_snapshot ?? {},
            after_snapshot: parsed.after_snapshot ?? {},
            status,
          });

          // If the change is implemented, update current sop_version + status=active.
          if (status === "implemented") {
            await setSopProjectVersionAndStatus(db, { project_id: parsed.project_id, version_number: parsed.version_number, status: "active" });
          }

          return row;
        });
        return jsonResponse(version);
      }

      if (name === "analyze-sop-effectiveness") {
        const parsed = AnalyzeSopEffectivenessInput.parse(args ?? {});
        const out = await withSopDb(async (db) => {
          const project = await getSopProjectById(db, parsed.project_id);
          if (!project) throw new Error(`No sop project found: ${parsed.project_id}`);
          return analyzeSopEffectivenessForProject({ db, project, days: parsed.days });
        });
        return jsonResponse(out);
      }

      if (name === "research-alternative-tools") {
        const parsed = ResearchAlternativeToolsInput.parse(args ?? {});
        return jsonResponse(researchAlternativeTools({ toolNames: parsed.tool_names }));
      }

      if (name === "generate-improvement-suggestions") {
        const parsed = GenerateImprovementSuggestionsInput.parse(args ?? {});
        const out = await withSopDb(async (db) => {
          const project = await getSopProjectById(db, parsed.project_id);
          if (!project) throw new Error(`No sop project found: ${parsed.project_id}`);
          const { analysisSummary } = await analyzeSopEffectivenessForProject({ db, project, days: parsed.days });
          // tool_names override is currently unused because suggestions generation uses the project inventory best-effort.
          return generateImprovementSuggestions({ project, analysisSummary });
        });
        return jsonResponse(out);
      }

      // Optional: future tool name extension for Notion backlog update.
      if (name === "send-optimization-backlog") {
        return jsonResponse({ ok: false, error: "Tool not implemented in this MCP version." });
      }
    } catch (err: any) {
      return jsonResponse({ ok: false, error: err?.message ?? String(err) });
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

