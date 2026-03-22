import type { Sql } from "postgres";
import crypto from "crypto";
import { createLocalFigmaArtifacts, generateMermaidDiagrams } from "./diagrams";
import { generateInitialSopSections } from "./generate/initialSop";
import { createNotionWorkspaceForSop, upsertNotionOptimizationBacklog, updateNotionTechStackSelection } from "./notion";
import {
  connectSopDb,
  createSopVersionSuggestion,
  ensureSopTables,
  getBusinessGoalsForCurrentMonth,
  upsertSopProject,
  approveSopVersionById,
} from "./db";
import type { SopProjectBrief, SopSopProjectRow, SopVersionStatus } from "./schema";

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function actionKeyboard(actions: Array<{ text: string; data: string }>) {
  return { inline_keyboard: [actions.map((a) => ({ text: a.text, callback_data: a.data }))] };
}

async function sendTelegramSopBriefing(params: { chatId?: string; token?: string; message: string; approveVersionId: string }) {
  const token = (params.token ?? env("TELEGRAM_BOT_TOKEN")).trim();
  const chatId = (params.chatId ?? env("TELEGRAM_CEO_COACH_CHAT_ID") ?? env("TELEGRAM_CHAT_ID") ?? env("TELEGRAM_DEFAULT_CHAT_ID")).trim();
  if (!token || !chatId) return { ok: false, skipped: true, reason: "Missing TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID" };

  const replyMarkup = actionKeyboard([{ text: "Approve", data: `cmd:/sop-approve ${params.approveVersionId}` }]);

  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: params.message,
      reply_markup: replyMarkup,
      disable_web_page_preview: true,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${text}`);
  return { ok: true, response: text };
}

function pickTopSuggestions(suggestions: Array<{ impactRank: number; effortRank: number }>) {
  const idx = suggestions
    .map((s, i) => ({ i, key: s.impactRank * 1000 - s.effortRank }))
    .sort((a, b) => b.key - a.key)[0]?.i;
  return idx == null ? 0 : idx;
}

function buildToolAlternatives(toolName: string) {
  // Best-effort static mapping (extend with real market research when an external research integration exists).
  const name = toolName.toLowerCase();
  if (name.includes("notion")) {
    return [
      {
        alternative_tool: "Confluence",
        use_case: "Team documentation + structured SOPs",
        pricing_free_tier: "no",
        monthly_cost_usd: "unknown",
        setup_complexity: "medium",
        integration_difficulty: "medium",
        user_reviews: "unknown (requires research)",
        pros: ["Robust permissions + enterprise workflows", "Strong knowledge management"],
        cons: ["Higher cost vs free Notion use", "Less nimble UX than Notion"],
        migration_cost: "medium",
      },
      {
        alternative_tool: "Slab",
        use_case: "Lightweight documentation hub for teams",
        pricing_free_tier: "yes",
        monthly_cost_usd: "unknown",
        setup_complexity: "easy",
        integration_difficulty: "easy",
        user_reviews: "unknown (requires research)",
        pros: ["Quick setup", "Good writing + search experience"],
        cons: ["Smaller ecosystem than Confluence/Notion"],
        migration_cost: "low",
      },
    ];
  }

  if (name.includes("figma")) {
    return [
      {
        alternative_tool: "Miro",
        use_case: "Diagramming + collaborative architecture maps",
        pricing_free_tier: "yes",
        monthly_cost_usd: "unknown",
        setup_complexity: "easy",
        integration_difficulty: "medium",
        user_reviews: "unknown (requires research)",
        pros: ["Collaboration-first diagrams", "Fast templates"],
        cons: ["Not an equivalent artifact model to Figma files"],
        migration_cost: "medium",
      },
      {
        alternative_tool: "Lucidchart",
        use_case: "ERDs + architecture diagrams",
        pricing_free_tier: "yes",
        monthly_cost_usd: "unknown",
        setup_complexity: "easy",
        integration_difficulty: "medium",
        user_reviews: "unknown (requires research)",
        pros: ["Great for diagrams and ERDs", "Easy to export"],
        cons: ["Collaboration differs from Figma workflows"],
        migration_cost: "low",
      },
    ];
  }

  if (name.includes("supabase")) {
    return [
      {
        alternative_tool: "Firebase (Firestore + Functions)",
        use_case: "System-of-record + event-driven workflows",
        pricing_free_tier: "yes",
        monthly_cost_usd: "unknown",
        setup_complexity: "medium",
        integration_difficulty: "medium",
        user_reviews: "unknown (requires research)",
        pros: ["Fast startup for event-driven apps", "Managed infrastructure"],
        cons: ["Schema + SQL migrations differ vs Postgres", "Potential vendor lock-in"],
        migration_cost: "high",
      },
      {
        alternative_tool: "AWS RDS (Postgres)",
        use_case: "Full control of relational backend",
        pricing_free_tier: "no",
        monthly_cost_usd: "unknown",
        setup_complexity: "hard",
        integration_difficulty: "medium",
        user_reviews: "unknown (requires research)",
        pros: ["Mature Postgres ecosystem", "Direct SQL compatibility"],
        cons: ["More ops overhead than Supabase"],
        migration_cost: "high",
      },
    ];
  }

  // Default: unknown tool -> generic alternatives list.
  return [
    {
      alternative_tool: "Evaluate 2-3 comparable tools",
      use_case: "TBD",
      pricing_free_tier: "unknown",
      monthly_cost_usd: "unknown",
      setup_complexity: "unknown",
      integration_difficulty: "unknown",
      user_reviews: "unknown",
      pros: ["May offer better docs/support or price"],
      cons: ["Needs research for accuracy"],
      migration_cost: "unknown",
    },
  ];
}

export async function analyzeSopEffectivenessForProject(params: { db: Sql; project: SopSopProjectRow; days?: number }) {
  const rows = await queryProjectDailyMetrics(params.db, params.project.project_id, params.days ?? 14).catch(() => []);
  const analysisSummary = summarizeMetrics(rows, params.project);
  return { analysisSummary, metricsRows: rows };
}

export function researchAlternativeTools(params: { toolNames: string[] }) {
  const tools = params.toolNames;
  return tools.map((tool) => {
    const alts = buildToolAlternatives(tool);
    return {
      current_tool: tool,
      alternatives: alts.map((a: any) => ({
        tool_name: a.alternative_tool ?? a.tool_name ?? "Alternative",
        use_case: a.use_case ?? "",
        pricing_free_tier: a.pricing_free_tier ?? "unknown",
        monthly_cost: a.monthly_cost_usd ?? "unknown",
        setup_complexity: a.setup_complexity ?? "unknown",
        integration_difficulty: a.integration_difficulty ?? "unknown",
        user_reviews: a.user_reviews ?? "unknown",
        pros_vs_current: a.pros ?? [],
        cons_vs_current: a.cons ?? [],
        migration_cost: a.migration_cost ?? "unknown",
      })),
    };
  });
}

export function generateImprovementSuggestions(params: {
  project: SopSopProjectRow;
  analysisSummary: { timelineVarianceText: string; costVarianceText: string; dataCoverageText: string };
}) {
  const { project, analysisSummary } = params;
  const tech = project.tech_stack as any;
  const externalApis: string[] = Array.isArray(tech?.external_apis)
    ? (tech.external_apis as any[]).map((x) => (typeof x === "string" ? x : x?.name ?? x?.api ?? "")).filter(Boolean)
    : [];

  const requiredTools = [...new Set(externalApis)].slice(0, 6);

  // Suggestion set: doc clarity + tool risk reduction + cost control.
  const suggestions: Array<{
    version_number: number;
    change_title: string;
    change_description: string;
    how_to_implement: string[];
    timeline: string;
    who_approves: string;
    testing_plan: string[];
    rollback_plan: string[];
    impactRank: number;
    effortRank: number;
    which_pages_changed: string[];
  }> = [];

  const nextVersion = Math.round((project.sop_version + 0.1) * 10) / 10;

  if (!requiredTools.length) {
    suggestions.push({
      version_number: nextVersion,
      change_title: "Add measurable tech-stack inventory to SOP",
      change_description:
        "Store an explicit inventory of external tools and integration endpoints inside the SOP so daily optimization can evaluate cost and reliability with real data.",
      how_to_implement: ["Add `tech_stack.external_apis` and endpoints into Supabase `sop_projects.tech_stack`.", "Update the Tech Stack Selection page with a canonical list."],
      timeline: "1-2 days",
      who_approves: "PM / Ops lead",
      testing_plan: ["Create a sample SOP and verify inventory renders in Notion.", "Run daily optimization once and confirm it can read the inventory."],
      rollback_plan: ["Revert Tech Stack Selection page content to prior snapshot (v before/after).", "Leave Supabase inventory fields unused if needed."],
      impactRank: 9,
      effortRank: 2,
      which_pages_changed: ["Tech Stack Selection", "Quality and Scaling", "OPTIMIZATION BACKLOG"],
    });
  } else {
    for (const tool of requiredTools.slice(0, 2)) {
      const alts = buildToolAlternatives(tool);
      const bestAlt = alts[0];
      suggestions.push({
        version_number: nextVersion,
        change_title: `Evaluate ${tool} alternative: ${bestAlt.alternative_tool}`,
        change_description:
          "Pricing, reliability, and integration friction are validated daily. This suggestion runs a controlled evaluation of a comparable alternative tool to reduce cost and increase documentation reliability.",
        how_to_implement: [
          `Record current ${tool} usage + failure modes.`,
          `Draft a migration plan to ${bestAlt.alternative_tool} (keep the audit trail snapshots).`,
          "Update Tech Stack Selection page with the research summary.",
        ],
        timeline: "3-7 days",
        who_approves: "CEO + Technical lead",
        testing_plan: [
          "Run a pilot SOP generation with the alternative tool.",
          "Validate that version audit trail and backlog updates still work end-to-end.",
          "Compare cost + reliability signals from sop_daily_metrics.",
        ],
        rollback_plan: ["Switch back to current tool via snapshot restore.", "Mark alternative evaluation as rejected in optimization backlog."],
        impactRank: 8,
        effortRank: tool.toLowerCase().includes("supabase") ? 6 : 4,
        which_pages_changed: ["Tech Stack Selection", "Risks and Mitigation", "OPTIMIZATION BACKLOG"],
      });
    }

    suggestions.push({
      version_number: nextVersion + 0.1,
      change_title: "Tighten version audit snapshots and approval workflow",
      change_description:
        "Improve the version control trail by capturing the exact pages/blocks touched per change and ensuring approval statuses are reflected consistently across Supabase and Notion backlog items.",
      how_to_implement: ["Store before/after snapshots per suggestion.", "Ensure Telegram approvals update sop_versions.status and are reflected in backlog."],
      timeline: "1-3 days",
      who_approves: "Ops lead",
      testing_plan: ["Generate a suggestion and approve via Telegram button.", "Verify supabase row status updates and backlog reflects version."],
      rollback_plan: ["Revert the backlog append by creating a new version row that restores the prior snapshot."],
      impactRank: 7,
      effortRank: 3,
      which_pages_changed: ["MCP Definitions", "Support and Maintenance", "OPTIMIZATION BACKLOG"],
    });
  }

  // Attach ranked order (highest impact, lowest effort first).
  suggestions.sort((a, b) => b.impactRank - a.impactRank || a.effortRank - b.effortRank);
  return suggestions.slice(0, 3);
}

async function queryProjectDailyMetrics(db: Sql, project_id: string, days = 14) {
  const rows = await db.unsafe(
    `
    select
      metric_date,
      actual_timeline_vs_estimated_days,
      actual_cost_usd,
      projected_cost_usd,
      client_satisfaction_score,
      tool_uptime_pct,
      integration_issues_count,
      team_feedback
    from public.sop_daily_metrics
    where project_id = $1
      and metric_date >= (current_date - ($2::int))
    order by metric_date desc
  `,
    [project_id, days],
  );
  return rows ?? [];
}

function summarizeMetrics(rows: any[], project: SopSopProjectRow) {
  if (!rows.length) {
    return {
      timelineVarianceText: "Insufficient data (no sop_daily_metrics rows yet).",
      costVarianceText: "Insufficient data (no sop_daily_metrics rows yet).",
      dataCoverageText: "0 days of KPI coverage.",
    };
  }

  const first = rows[0];
  const avgCost =
    rows
      .map((r) => (typeof r.actual_cost_usd === "number" ? r.actual_cost_usd : Number(r.actual_cost_usd)))
      .filter((n) => Number.isFinite(n))
      .reduce((a: number, b: number) => a + b, 0) / rows.length;

  const avgProj =
    rows
      .map((r) => (typeof r.projected_cost_usd === "number" ? r.projected_cost_usd : Number(r.projected_cost_usd)))
      .filter((n) => Number.isFinite(n))
      .reduce((a: number, b: number) => a + b, 0) / rows.length;

  const delta = Number.isFinite(avgCost) && Number.isFinite(avgProj) && avgProj !== 0 ? (avgCost - avgProj) / avgProj : null;
  const costVarianceText =
    delta == null
      ? "Cost variance: not computable (missing actual/projection)."
      : `Cost variance: ${(delta >= 0 ? "+" : "") + Math.round(delta * 1000) / 10}% over projected avg.`;

  const avgTimeline = rows
    .map((r) => (typeof r.actual_timeline_vs_estimated_days === "number" ? r.actual_timeline_vs_estimated_days : Number(r.actual_timeline_vs_estimated_days)))
    .filter((n) => Number.isFinite(n))
    .reduce((a: number, b: number) => a + b, 0) / rows.length;

  const timelineVarianceText = Number.isFinite(avgTimeline) ? `Timeline variance: ${avgTimeline >= 0 ? "+" : ""}${Math.round(avgTimeline * 10) / 10} days vs estimate (avg).` : "Timeline variance: not computable.";

  const uptime = rows.map((r) => Number(r.tool_uptime_pct)).filter((n) => Number.isFinite(n));
  const uptimeText = uptime.length ? `Tool uptime avg: ${Math.round((uptime.reduce((a, b) => a + b, 0) / uptime.length) * 10) / 10}%` : "Tool uptime: not provided.";

  return {
    timelineVarianceText,
    costVarianceText,
    dataCoverageText: `${rows.length} days coverage. ${uptimeText}`,
  };
}

export async function createSopFromBriefAndSyncToBackend(brief: SopProjectBrief) {
  const db = connectSopDb();
  if (!db) throw new Error("SOP database connection missing (set SOP_PG_URL or DATABASE_URL).");

  await ensureSopTables(db);

  const created_by = (brief.created_by ?? env("SOP_CREATED_BY") ?? "system").trim();
  const rootTitle = `SOP - ${brief.client_name} / ${brief.project_name}`;

  const sections = generateInitialSopSections(brief);
  const diagram_bundle = generateMermaidDiagrams(brief);

  const projectIdInput = brief.project_id ? brief.project_id : undefined;

  const techStack = {
    required_agents: brief.required_agents ?? [],
    external_apis: brief.external_apis ?? [],
    technical_requirements: brief.technical_requirements ?? {},
    team_size: brief.team_size ?? null,
    timeline: brief.timeline ?? null,
  };

  const notion = await createNotionWorkspaceForSop({
    brief,
    rootTitle,
    sections,
  }).catch(() => ({ notionWorkspaceUrl: null, notionRootPageId: null, notionPageIdsByTitle: {} }));

  // Persist in Supabase.
  const projectRow = await upsertSopProject(db, {
    project_id: projectIdInput,
    client_id: brief.client_id ?? null,
    notion_workspace_url: notion.notionWorkspaceUrl,
    figma_file_url: null,
    sop_version: 1.0,
    created_by,
    status: "draft",
    project_name: brief.project_name,
    client_name: brief.client_name,
    tech_stack: techStack,
    notion_root_page_id: notion.notionRootPageId,
    notion_pages: notion.notionPageIdsByTitle,
    sop_sections: sections,
    diagram_bundle,
  });

  const figma = await createLocalFigmaArtifacts({ project_id: projectRow!.project_id, brief }).catch(() => ({
    figmaFileUrl: null,
    outDir: null,
  }));

  if (figma.figmaFileUrl) {
    await db.unsafe(`update public.sop_projects set figma_file_url = $2, updated_at = now() where project_id = $1`, [
      projectRow!.project_id,
      figma.figmaFileUrl,
    ]);
  }

  const now = new Date().toISOString();
  const v = await createSopVersionSuggestion(db, {
    project_id: projectRow!.project_id,
    version_number: 1.0,
    change_description: "Initial SOP generated (v1.0).",
    changed_by: created_by,
    which_pages_changed: sections.map((s) => s.title),
    before_snapshot: { status: "none" },
    after_snapshot: {
      sections,
      notion: notion.notionPageIdsByTitle,
      figma: figma.figmaFileUrl,
      techStack,
      generated_at: now,
    },
    status: "implemented",
  });

  return {
    project_id: projectRow!.project_id,
    notion_workspace_url: projectRow!.notion_workspace_url,
    figma_file_url: figma.figmaFileUrl ?? projectRow!.figma_file_url,
    sop_version: projectRow!.sop_version,
    version_id: v?.id ?? null,
  };
}

export async function runDailySopOptimization(params?: { project_id?: string }) {
  const db = connectSopDb();
  if (!db) throw new Error("SOP database connection missing.");

  await ensureSopTables(db);

  const projects: SopSopProjectRow[] = params?.project_id
    ? ((await db.unsafe(
        `
        select
          project_id::text as project_id,
          client_id::text as client_id,
          notion_workspace_url,
          figma_file_url,
          sop_version::float8 as sop_version,
          created_at::text as created_at,
          updated_at::text as updated_at,
          created_by,
          status,
          project_name,
          client_name,
          tech_stack,
          last_optimization_at::text as last_optimization_at,
          notion_root_page_id,
          notion_backlog_page_id,
          notion_pages
        from public.sop_projects
        where project_id = $1
        limit 1
      `,
        [params.project_id],
      )) as any[]).map((r: any) => ({
        project_id: String(r.project_id),
        client_id: r.client_id ? String(r.client_id) : null,
        notion_workspace_url: r.notion_workspace_url ?? null,
        figma_file_url: r.figma_file_url ?? null,
        sop_version: Number(r.sop_version ?? 1.0),
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
        created_by: String(r.created_by ?? ""),
        status: (r.status as any) ?? "draft",
        project_name: String(r.project_name ?? ""),
        client_name: String(r.client_name ?? ""),
        tech_stack: r.tech_stack ?? {},
        last_optimization_at: r.last_optimization_at ? String(r.last_optimization_at) : null,
        notion_root_page_id: r.notion_root_page_id ? String(r.notion_root_page_id) : null,
        notion_backlog_page_id: r.notion_backlog_page_id ? String(r.notion_backlog_page_id) : null,
        notion_pages: r.notion_pages ?? {},
      }))
    : await (async () => {
        // Include both draft and active projects (optimization is valuable before activation too).
        const rows = await db.unsafe(
          `
          select
            project_id::text as project_id,
            client_id::text as client_id,
            notion_workspace_url,
            figma_file_url,
            sop_version::float8 as sop_version,
            created_at::text as created_at,
            updated_at::text as updated_at,
            created_by,
            status,
            project_name,
            client_name,
            tech_stack,
            last_optimization_at::text as last_optimization_at,
            notion_root_page_id,
            notion_backlog_page_id,
            notion_pages
          from public.sop_projects
          where status in ('draft','active')
          order by updated_at desc
          limit 10
        `,
          [],
        );
        return (rows ?? []).map((r: any) => ({
          project_id: String(r.project_id),
          client_id: r.client_id ? String(r.client_id) : null,
          notion_workspace_url: r.notion_workspace_url ?? null,
          figma_file_url: r.figma_file_url ?? null,
          sop_version: Number(r.sop_version ?? 1.0),
          created_at: String(r.created_at),
          updated_at: String(r.updated_at),
          created_by: String(r.created_by ?? ""),
          status: (r.status as any) ?? "draft",
          project_name: String(r.project_name ?? ""),
          client_name: String(r.client_name ?? ""),
          tech_stack: r.tech_stack ?? {},
          last_optimization_at: r.last_optimization_at ? String(r.last_optimization_at) : null,
          notion_root_page_id: r.notion_root_page_id ? String(r.notion_root_page_id) : null,
          notion_backlog_page_id: r.notion_backlog_page_id ? String(r.notion_backlog_page_id) : null,
          notion_pages: r.notion_pages ?? {},
        }));
      })();

  const businessGoals = await getBusinessGoalsForCurrentMonth(db);

  const summaryPerProject: any[] = [];

  for (const project of projects) {
    const metricsRows = await queryProjectDailyMetrics(db, project.project_id, 14).catch(() => []);
    const analysisSummary = summarizeMetrics(metricsRows, project);

    // STEP 2/3: research alternatives for the current tool inventory (best-effort static mapping).
    const tech = project.tech_stack as any;
    const toolNames: string[] = Array.isArray(tech?.external_apis)
      ? (tech.external_apis as any[]).map((x) => (typeof x === "string" ? x : x?.name ?? x?.api ?? "")).filter(Boolean)
      : [];
    const alternatives = researchAlternativeTools({ toolNames });

  const suggestions = generateImprovementSuggestions({ project, analysisSummary });

    const versions: Array<{ version_id: string; status: SopVersionStatus; version_number: number; change_title: string }> = [];

    // Persist suggestions as new versions.
    for (const s of suggestions) {
      const version = await createSopVersionSuggestion(db, {
        project_id: project.project_id,
        version_number: s.version_number,
        change_description: s.change_title + " — " + s.change_description.slice(0, 140),
        changed_by: env("SOP_DAILY_ANALYZER") ?? "daily-optimizer",
        which_pages_changed: s.which_pages_changed,
        before_snapshot: { project_sop_version: project.sop_version, analysis: analysisSummary },
        after_snapshot: { suggestion: s, analysis: analysisSummary, alternatives },
        status: "suggested",
      });
      if (version?.id) versions.push({ version_id: version.id, status: version.status as SopVersionStatus, version_number: s.version_number, change_title: s.change_title });
    }

    // Notion backlog update.
    const topIdx = pickTopSuggestions(suggestions);
    const top = suggestions[topIdx];
    const topVersionId = versions[topIdx]?.version_id ?? versions[0]?.version_id ?? null;

    try {
      const backlogUpdateItems = versions.map((v, i) => {
        const s = suggestions[i];
        const priorityLabel = `Impact ${s.impactRank}/10 • Effort ${s.effortRank}/10`;
        return {
          id: v.version_id,
          version_number: s.version_number,
          priorityLabel,
          change_description: s.change_title,
          impact: `Impact ${s.impactRank}/10`,
          effort: `Effort ${s.effortRank}/10`,
          tradeoffs: s.change_description,
        };
      });

      const backlog = await upsertNotionOptimizationBacklog({
        projectRootPageId: project.notion_root_page_id,
        backlogPageId: project.notion_backlog_page_id,
        title: `${project.client_name} / ${project.project_name}`,
        items: backlogUpdateItems,
      });

      // Update Tech Stack Selection page with a small “last reviewed” note.
      const pages = (project.notion_pages ?? {}) as any;
      const techStackPageId = pages["Tech Stack Selection"] ?? pages["Tech Stack Selection".toString()] ?? null;
      if (techStackPageId) {
        const altSummary = alternatives
          .map((t: any) => {
            const top = Array.isArray(t.alternatives) && t.alternatives[0] ? t.alternatives[0] : null;
            return top ? `${t.current_tool}: consider ${top.tool_name} (${top.pricing_free_tier} free tier)` : `${t.current_tool}: alternatives TBD`;
          })
          .slice(0, 6)
          .join("\n");

        await updateNotionTechStackSelection({
          pageId: techStackPageId,
          content:
            `Last reviewed: ${new Date().toISOString().slice(0, 10)}.\n\n` +
            `Top alternative candidates (best-effort):\n${altSummary}\n\n` +
            `Suggestions: ${suggestions.map((s) => s.change_title).join(" • ")}`,
        });
      }

      // Store backlog page id on the project.
      if (backlog.backlogPageId && backlog.backlogPageId !== project.notion_backlog_page_id) {
        await db.unsafe(`update public.sop_projects set notion_backlog_page_id = $2, updated_at = now() where project_id = $1`, [project.project_id, backlog.backlogPageId]);
      }
    } catch {
      // Notion failures should not break optimization.
    }

    // Send Telegram briefing with one-click approval.
    if (topVersionId) {
      const message =
        `Daily SOP optimization (${new Date().toISOString().slice(0, 10)})\n\n` +
        `Project: ${project.client_name} — ${project.project_name}\n` +
        `Improvements identified: ${suggestions.length}\n\n` +
        `Top suggestion (high impact / low effort):\n` +
        `- ${top.change_title}\n\n` +
        `Cost signals: ${analysisSummary.costVarianceText}\n` +
        `Timeline signals: ${analysisSummary.timelineVarianceText}\n` +
        `Possible cost savings: ${alternatives.length ? "TBD (pricing research captured in audit snapshots)" : "TBD (tool inventory missing)"}\n` +
        `Performance improvements possible: ${metricsRows.some((r) => (Number(r.integration_issues_count ?? 0) > 0)) ? "Likely (integration reliability)" : "Likely"}\n` +
        `Data coverage: ${analysisSummary.dataCoverageText}\n\n` +
        `Approve to mark it as 'approved' in Supabase.`;

      try {
        await sendTelegramSopBriefing({ message, approveVersionId: topVersionId });
      } catch {
        // ignore
      }
    }

    // Strategic analysis: send to CEO coach agent (Telegram) as a short actionable block.
    if (env("TELEGRAM_CEO_COACH_CHAT_ID") || env("TELEGRAM_CHAT_ID") || env("TELEGRAM_DEFAULT_CHAT_ID")) {
      const recs: string[] = [];
      if (businessGoals.target_new_clients_month != null) {
        recs.push(`Target new clients/month: ${businessGoals.target_new_clients_month}. Drive with: faster SOP iteration + tighter integration reliability.`);
      }
      if (businessGoals.target_mrr_monthly != null) {
        recs.push(`Target MRR: ${businessGoals.target_mrr_monthly}. Drive with: tool cost control + predictable delivery cadence.`);
      }
      if (businessGoals.expansion_goals) recs.push(`Expansion goal: ${businessGoals.expansion_goals}. Consider SOP variants by segment if KPI variance suggests it.`);

      if (recs.length) {
        const msg = `CEO Coach Strategic Recommendations\n\n${recs.join("\n")}\n\nProject: ${project.client_name} — ${project.project_name}`;
        // Persist for the CEO Coach MCP agent (ceo-coach) to do deeper analysis/coaching.
        try {
          await db.unsafe(`
            create table if not exists ceo_coach_briefings (
              id text primary key,
              briefing_date date not null,
              created_at timestamptz not null default now(),
              month_start date not null,
              month_end date not null,
              briefing_text text not null,
              briefing_json jsonb not null
            );
          `);
          const id = `ceo_brief_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
          const briefingDate = new Date().toISOString().slice(0, 10);
          const payload = JSON.stringify({
            recs,
            project: { client_name: project.client_name, project_name: project.project_name },
          });

          await db`
            insert into ceo_coach_briefings (id, briefing_date, month_start, month_end, briefing_text, briefing_json)
            values (
              ${id},
              ${briefingDate}::date,
              date_trunc('month', now())::date,
              (date_trunc('month', now())::date + interval '1 month')::date,
              ${msg},
              ${payload}::jsonb
            )
          `;
        } catch {
          // If ceo-coach tables aren't set up yet, Telegram still goes out.
        }

        // Use plain alert send (no buttons) to avoid over-crowding.
        try {
          const token = env("TELEGRAM_BOT_TOKEN");
          const chatId = env("TELEGRAM_CEO_COACH_CHAT_ID") || env("TELEGRAM_CHAT_ID") || env("TELEGRAM_DEFAULT_CHAT_ID");
          await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: msg, disable_web_page_preview: true }),
          });
        } catch {
          // ignore
        }
      }
    }

    // Mark last optimization timestamp.
    await db.unsafe(`update public.sop_projects set last_optimization_at = now(), updated_at = now() where project_id = $1`, [project.project_id]);

    summaryPerProject.push({
      project_id: project.project_id,
      suggestions: suggestions.map((s) => ({ change_title: s.change_title, version_number: s.version_number })),
      versions: versions.map((v) => ({ id: v.version_id, status: v.status })),
    });
  }

  return { ok: true, run_at: new Date().toISOString(), projects_analyzed: projects.length, summary: summaryPerProject };
}

// Convenience helper for MCP / approval workflows.
export async function approveSopVersionFromTelegram(params: { version_id: string; approved_by: string }) {
  const db = connectSopDb();
  if (!db) throw new Error("SOP database connection missing.");
  await ensureSopTables(db);

  const out = await approveSopVersionById(db, params.version_id, params.approved_by);
  return out;
}

