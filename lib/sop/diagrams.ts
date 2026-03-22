import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { SopProjectBrief } from "./schema";

function safeSlug(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mkMermaidSystemOverview(brief: SopProjectBrief) {
  const agents = (brief.required_agents ?? []).slice(0, 12);
  const ext = (brief.external_apis ?? []).map((x: any) => (typeof x === "string" ? x : x?.name ?? x?.api ?? "External")).slice(0, 12);
  const tech = [...agents.map((a) => `Agent: ${a}`), ...ext.map((x) => `API: ${x}`)].slice(0, 18);

  return `flowchart LR
  %% World-class overview (conceptual)
  subgraph "System Overview"
    direction TB
    A["SOP Generator (mcp/sop-generator)"] --> B["Notion Workspace"]
    A --> C["Diagram Artifacts"]
    A --> D["Supabase (State + Audit Trail)"]
    A --> E["Telegram Briefings + Approvals"]
  end

  subgraph "Key Components"
    direction TB
    ${tech.map((t, i) => `N${i}["${t}"]`).join("\n    ")}
  end
`;
}

function mkMermaidAgentFlow(brief: SopProjectBrief) {
  const agents = (brief.required_agents ?? []).slice(0, 10);
  const ext = (brief.external_apis ?? []).map((x: any) => (typeof x === "string" ? x : x?.name ?? x?.api ?? "External")).slice(0, 8);
  const nodes = agents.map((a, i) => `A${i}["${a}"]`).join("\n  ");
  const edges = agents
    .slice(0, Math.max(0, agents.length - 1))
    .map((a, i) => `A${i} --> A${i + 1}`)
    .join("\n  ");

  return `flowchart TD
  R["Project Brief JSON"] --> S["Generate Initial SOP"]
  S --> N0["Notion Pages (16 sections)"]
  S --> N1["Figma Diagram Artifacts"]
  S --> N2["Create Checklists"]
  S --> N3["Persist to Supabase (sop_projects/sop_versions)"]

  subgraph "Agent Flow"
    direction LR
    ${nodes || 'A0["(No required agents provided)"]'}
  end

  ${edges || ""}

  %% External signals (best-effort)
  ${ext.map((x, i) => `X${i}["${x}"]`).join("\n  ")}
`;
}

function mkMermaidDatabaseSchema() {
  // Minimal: SOP core tables + business goals and daily metrics.
  return `erDiagram
    SOP_PROJECTS ||--o{ SOP_VERSIONS : "has"
    SOP_PROJECTS ||--o{ SOP_DAILY_METRICS : "collects"

    SOP_PROJECTS {
      uuid project_id PK
      uuid client_id
      numeric sop_version
      text status
      text notion_workspace_url
      text figma_file_url
      timestamptz last_optimization_at
    }

    SOP_VERSIONS {
      uuid id PK
      uuid project_id FK
      numeric version_number
      text change_description
      text status
      timestamptz implementation_date
      jsonb before_snapshot
      jsonb after_snapshot
    }

    SOP_DAILY_METRICS {
      uuid id PK
      uuid project_id FK
      date metric_date
      int actual_timeline_vs_estimated_days
      numeric actual_cost_usd
      numeric projected_cost_usd
      numeric client_satisfaction_score
      numeric tool_uptime_pct
      int integration_issues_count
      text team_feedback
      jsonb tech_stack_effectiveness
    }
`;
}

function mkMermaidTechStack(brief: SopProjectBrief) {
  const ext = (brief.external_apis ?? [])
    .map((x: any) => (typeof x === "string" ? x : x?.name ?? x?.api ?? "External"))
    .slice(0, 12);

  return `flowchart TB
  N0["User/Brief"] --> N1["sop-generator MCP"]
  N1 --> N2["Notion API"]
  N1 --> N3["Diagram Artifacts (local)"]
  N1 --> N4["Supabase Postgres"]
  N1 --> N5["Telegram Bot API"]

  ${ext.map((x, i) => `E${i}["${x}"]`).join("\n  ")}
`;
}

function mkMermaidTimeline(brief: SopProjectBrief) {
  // Mermaid gantt isn't consistently supported; keep it conceptual and readable.
  return `flowchart LR
  T0["Phase 1\\nDraft SOP v1.0"] --> T1["Phase 2\\nDaily optimization loop"]
  T1 --> T2["Phase 3\\nApproval workflow + audit trail"]
  T2 --> T3["Phase 4\\nImplementation automation + scaling"]

  %% From brief (raw)
  B["Timeline brief: ${JSON.stringify(brief.timeline ?? {})}"]
  T0 -.-> B
`;
}

export function generateMermaidDiagrams(brief: SopProjectBrief) {
  return {
    systemOverview: mkMermaidSystemOverview(brief),
    agentFlow: mkMermaidAgentFlow(brief),
    databaseSchema: mkMermaidDatabaseSchema(),
    techStack: mkMermaidTechStack(brief),
    timeline: mkMermaidTimeline(brief),
  };
}

export async function createLocalFigmaArtifacts(params: { project_id: string; brief: SopProjectBrief }) {
  const repoRoot = process.cwd();
  const outDir = join(repoRoot, "public", "sop-artifacts", safeSlug(params.project_id));
  await mkdir(outDir, { recursive: true });

  const mermaid = generateMermaidDiagrams(params.brief);

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>VantageStack SOP Artifacts</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 24px; }
      h1 { margin-bottom: 8px; }
      .grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
      .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px; background: #ffffff; }
      pre { white-space: pre-wrap; word-break: break-word; background: #f9fafb; padding: 12px; border-radius: 10px; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  </head>
  <body>
    <h1>System Diagrams (Mermaid)</h1>
    <div class="grid">
      <div class="card"><h2>System Overview</h2><div class="mermaid">${mermaid.systemOverview.replaceAll("<", "&lt;")}</div></div>
      <div class="card"><h2>Agent Flow</h2><div class="mermaid">${mermaid.agentFlow.replaceAll("<", "&lt;")}</div></div>
      <div class="card"><h2>Database Schema</h2><div class="mermaid">${mermaid.databaseSchema.replaceAll("<", "&lt;")}</div></div>
      <div class="card"><h2>Tech Stack Visualization</h2><div class="mermaid">${mermaid.techStack.replaceAll("<", "&lt;")}</div></div>
      <div class="card"><h2>Timeline</h2><div class="mermaid">${mermaid.timeline.replaceAll("<", "&lt;")}</div></div>
    </div>
    <script>
      mermaid.initialize({ startOnLoad: true, securityLevel: "strict" });
    </script>
  </body>
</html>
`;

  const indexHtmlPath = join(outDir, "index.html");
  await writeFile(indexHtmlPath, html, "utf-8");

  // Since we can't create true Figma files via REST reliably, we store a link to artifacts.
  const figmaFileUrl = `/sop-artifacts/${safeSlug(params.project_id)}/index.html`;

  return { figmaFileUrl, outDir };
}

