import type { SopProjectBrief } from "../schema";

export type SopSection = { title: string; markdown: string };

const SECTION_TITLES: string[] = [
  "Project Overview",
  "Discovery and Requirements",
  "System Architecture",
  "Tech Stack Selection",
  "MCP Definitions",
  "Implementation Roadmap",
  "Deployment Checklist",
  "Cost Breakdown",
  "Timeline and Milestones",
  "Risks and Mitigation",
  "Support and Maintenance",
  "Voice Agent Operations",
  "Internal Systems Operations",
  "Business Operations",
  "Quality and Scaling",
  "References and Resources",
];

function asPrettyJson(v: unknown) {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function budgetAllocation(budget: unknown) {
  // Conservative, phase-based default split (adjust later via optimization/backlog).
  const total = typeof budget === "number" && Number.isFinite(budget) ? budget : null;
  const split = [
    { phase: "Discovery + Requirements", pct: 0.1 },
    { phase: "Architecture + Tech Stack", pct: 0.15 },
    { phase: "Implementation", pct: 0.45 },
    { phase: "Integration + Testing", pct: 0.2 },
    { phase: "Deployment + Hardening", pct: 0.1 },
  ];
  return total
    ? split.map((s) => ({ ...s, amount: Math.round(total * s.pct) }))
    : split.map((s) => ({ ...s, amount: null }));
}

export function generateInitialSopSections(brief: SopProjectBrief): SopSection[] {
  const tech = (brief.technical_requirements ?? {}) as any;
  const extApis = brief.external_apis ?? [];
  const requiredAgents = brief.required_agents ?? [];

  const allocation = budgetAllocation(brief.budget);

  const sections = SECTION_TITLES.map((title) => {
    if (title === "Project Overview") {
      return {
        title,
        markdown: `## Summary
- **Project**: ${brief.project_name}
- **Client**: ${brief.client_name}
- **Team size**: ${brief.team_size ?? "TBD"}
- **Status**: Initial SOP generated (v1.0 draft)

## Business goals
\`\`\`
${asPrettyJson(brief.business_goals ?? {})}
\`\`\`

## What success looks like
- Clear, repeatable delivery flow
- Predictable timelines and cost controls
- High reliability of integrations
- A continuous optimization loop (daily at 7am)`,
      };
    }

    if (title === "Discovery and Requirements") {
      return {
        title,
        markdown: `## Discovery inputs to confirm
- Client constraints (process, tools, approvals)
- Required data sources and delivery channels
- Success KPIs and measurement method

## Technical requirements (source brief)
\`\`\`
${asPrettyJson(brief.technical_requirements ?? {})}
\`\`\`

## External integrations requested
\`\`\`
${asPrettyJson(extApis)}
\`\`\`

## Agent roles required
${requiredAgents.length ? requiredAgents.map((a) => `- ${a}`).join("\n") : "- (Not specified in brief)"}`,
      };
    }

    if (title === "System Architecture") {
      return {
        title,
        markdown: `## High-level architecture
- SOP generator + optimizer MCP (mcp/sop-generator)
- Notion workspace for SOP documentation + optimization backlog
- Figma diagram artifacts (generated as diagrams; Figma API may require manual file creation)
- Supabase Postgres as the system-of-record for versions + KPI snapshots
- Telegram notifications for daily optimization briefings + approvals

## Data flow (conceptual)
1. Project brief arrives (JSON)
2. Generate initial SOP: Notion + diagram artifacts + checklists
3. Persist in Supabase (sop_projects, sop_versions)
4. Daily job runs at 7am:
   - analyze -> research alternatives -> suggest changes -> backlog + Telegram approvals

## Open questions
- Exact Notion parent page/database policy
- Exact Figma file creation workflow (API limitations)`
      };
    }

    if (title === "Tech Stack Selection") {
      return {
        title,
        markdown: `## Chosen stack (initial)
- **Documentation**: Notion
- **Diagrams**: Figma (with diagram artifacts generated programmatically)
- **DB / system-of-record**: Supabase Postgres
- **Automation orchestration**: Next.js cron routes + MCP tools
- **Notifications**: Telegram

## Current integrations (from brief)
\`\`\`
${asPrettyJson(extApis)}
\`\`\`

## Optimization loop contract
- Each day we validate whether chosen tools remain best-in-class.
- If pricing or reliability changes materially, we add a ranked suggestion to the backlog.`,
      };
    }

    if (title === "MCP Definitions") {
      return {
        title,
        markdown: `## MCP servers used
- ${"telegram-orchestrator"} (Telegram command routing)
- ${"briefing-generator"} (example daily briefing tooling)
- ${"scheduler-engine"} / internal libs (job logging + retries)
- ${"sop-generator"} (this SOP system)

## ` + "sop-generator" + ` tool contract
- create-notion-database
- write-notion-pages
- create-figma-file
- draw-architecture-diagram
- generate-checklist
- sync-to-backend
- update-sop-version
- analyze-sop-effectiveness
- research-alternative-tools
- generate-improvement-suggestions`,
      };
    }

    if (title === "Implementation Roadmap") {
      return {
        title,
        markdown: `## Roadmap phases
- Phase 1: Initial SOP generation + persistence (v1.0)
- Phase 2: Daily optimization loop + version audit trail
- Phase 3: Approval workflow (Telegram -> Supabase)
- Phase 4: Implementation automation (optional) and scaling playbook

## Deliverables
- 16-section Notion workspace
- Tech Stack Selection + OPTIMIZATION BACKLOG updates
- Figma diagram artifacts
- Supabase tables + version history
- Daily telegram briefings with approval buttons`,
      };
    }

    if (title === "Deployment Checklist") {
      return {
        title,
        markdown: `## Deployment checklist
- [ ] Supabase: run/ensure SOP tables exist
- [ ] Notion: configure API token + root parent page
- [ ] Telegram: configure bot token + chat ids
- [ ] Cron: enable /api/cron/sop-optimization (7am UTC)
- [ ] Verify approval flow (Telegram -> update sop_versions.status)
- [ ] Run smoke test: create a draft SOP from a brief
- [ ] Run daily job once with a small project set

## Rollback plan
- Disable cron route
- Keep DB migrations/tables (audit trail preservation)
- Restore last known-good SOP pages (from snapshots)`,
      };
    }

    if (title === "Cost Breakdown") {
      return {
        title,
        markdown: `## Budget baseline
- Budget (from brief): \`${brief.budget ?? "TBD"}\`

## Suggested allocation
${allocation
  .map((a) => `- ${a.phase}: ${a.pct * 100}%${a.amount != null ? ` (\$${a.amount})` : ""}`)
  .join("\n")}

## Ongoing optimization controls
- Re-check tool pricing weekly (via research tool)
- Track actual vs projected timeline/cost in sop_daily_metrics
- Add suggestions if ROI improves materially`,
      };
    }

    if (title === "Timeline and Milestones") {
      return {
        title,
        markdown: `## Timeline (from brief)
\`\`\`
${asPrettyJson(brief.timeline ?? {})}
\`\`\`

## Milestones (initial default)
- SOP v1.0 draft created
- Diagrams + checklists generated
- Supabase persisted
- Telegram daily briefing sends successfully
- Backlog created and version audit trail working`,
      };
    }

    if (title === "Risks and Mitigation") {
      return {
        title,
        markdown: `## Risks
- Notion/Figma API limitations or missing tokens
- Tool pricing changes or degraded reliability
- Approval workflow gaps (Telegram button not handled)
- KPI measurement gaps (missing data in Supabase)

## Mitigation strategy
- Idempotent table creation (ensureSopTables)
- “Best-effort” external integrations with safe fallbacks
- Version audit trail with before/after snapshots
- Daily job designed to continue even if some projects fail`,
      };
    }

    if (title === "Support and Maintenance") {
      return {
        title,
        markdown: `## Support model
- Daily optimization at 7am UTC
- Issue triage via Telegram alerts on cron failure
- Backlog suggestions include testing + rollback plan

## Maintenance checklist
- [ ] Review and implement approved suggestions
- [ ] Validate integrations after notable outages
- [ ] Keep Notion/Figma artifacts fresh`,
      };
    }

    if (title === "Voice Agent Operations") {
      return {
        title,
        markdown: `## Voice agent runbook (template)
1. Confirm session context + client settings
2. Load SOP-specific knowledge (Notion pages or generated artifacts)
3. Execute task steps with deterministic checklists
4. Log tool usage + outcomes into Supabase (if available)
5. Escalate on low confidence or missing data

## Quality gates
- Hallucination prevention via structured outputs
- Fallback to “manual review required” when inputs are missing`,
      };
    }

    if (title === "Internal Systems Operations") {
      return {
        title,
        markdown: `## Internal operations
- MCP tools are the contract boundary between agents and systems
- Cron routes orchestrate daily workflows
- Supabase tables store state, audit trail, and KPI snapshots

## Observability
- Use scheduler-engine job logging + retries
- Track DB query durations and Telegram alerts on failures`,
      };
    }

    if (title === "Business Operations") {
      return {
        title,
        markdown: `## Business process
- Acquisition brief -> initial SOP draft -> activation
- Continuous optimization loop improves ROI and reduces cost
- Weekly/Monthly review uses KPI snapshots and versions audit trail

## Approvals
- Telegram one-click approval marks sop_versions.status = 'approved'
- Implementation can be automated later or performed manually with snapshots`,
      };
    }

    if (title === "Quality and Scaling") {
      return {
        title,
        markdown: `## Quality rubric
- Timelines: variance vs estimate
- Cost: actual vs projected
- Reliability: tool uptime / integration failure rates
- Client satisfaction: CSAT tracking

## Scaling plan
- Increase throughput by:
  - standardizing checklists
  - reducing bespoke integrations
  - caching research and templates
- Add separate SOPs for client segments once KPI evidence supports it`,
      };
    }

    // References and Resources
    return {
      title,
      markdown: `## References
- VantageStack codebase: MCP servers + cron jobs
- Supabase: sop_projects and sop_versions tables
- Telegram: approval flow (/sop-approve)

## Notes
- External research inputs should be stored as citations (URLs) inside optimization snapshots.`,
    };
  });

  return sections;
}

