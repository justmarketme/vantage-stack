import postgres, { type Sql } from "postgres";
import type { SopProjectStatus, SopVersionStatus } from "./schema";
import crypto from "crypto";

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function getSopDbUrl(): string | null {
  return (
    env("SOP_PG_URL") ||
    env("SUPABASE_DB_URL") ||
    env("DATABASE_URL") ||
    env("REPORTS_PG_URL") ||
    env("BRIEFING_PG_URL") ||
    env("WEEKLY_PG_URL") ||
    ""
  ).trim() || null;
}

export function connectSopDb(): Sql | null {
  const url = getSopDbUrl();
  if (!url) return null;
  return postgres(url, { max: 5, prepare: false });
}

export async function ensureSopTables(db: Sql) {
  await db.unsafe(`
    create extension if not exists "pgcrypto";

    create table if not exists public.sop_projects (
      project_id uuid primary key default gen_random_uuid(),
      client_id uuid null,
      notion_workspace_url text null,
      figma_file_url text null,
      sop_version numeric not null default 1.0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      created_by text not null default '',
      status text not null default 'draft',
      project_name text not null,
      client_name text not null,
      tech_stack jsonb not null default '{}'::jsonb,
      last_optimization_at timestamptz null,
      notion_root_page_id text null,
      notion_backlog_page_id text null,
      notion_pages jsonb not null default '{}'::jsonb
    );

    create index if not exists sop_projects_status_idx on public.sop_projects (status);
    create index if not exists sop_projects_updated_at_idx on public.sop_projects (updated_at desc);

    create table if not exists public.sop_versions (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.sop_projects(project_id) on delete cascade,
      version_number numeric not null,
      change_description text not null,
      changed_by text not null default '',
      changed_at timestamptz not null default now(),
      which_pages_changed jsonb not null default '[]'::jsonb,
      before_snapshot jsonb not null default '{}'::jsonb,
      after_snapshot jsonb not null default '{}'::jsonb,
      status text not null default 'suggested',
      implementation_date timestamptz null
    );

    create index if not exists sop_versions_project_idx on public.sop_versions (project_id, changed_at desc);
    create index if not exists sop_versions_status_idx on public.sop_versions (status);

    -- KPI / business goals snapshot used for strategic analysis.
    create table if not exists public.business_goals (
      id uuid primary key default gen_random_uuid(),
      month_start date not null default (date_trunc('month', now())::date),
      target_new_clients_month int null,
      target_mrr_monthly numeric null,
      target_team_size int null,
      target_service_offerings jsonb not null default '{}'::jsonb,
      expansion_goals text null
    );

    create table if not exists public.sop_daily_metrics (
      id uuid primary key default gen_random_uuid(),
      project_id uuid not null references public.sop_projects(project_id) on delete cascade,
      metric_date date not null default now()::date,
      actual_timeline_vs_estimated_days int null,
      actual_cost_usd numeric null,
      projected_cost_usd numeric null,
      client_satisfaction_score numeric null,
      tool_uptime_pct numeric null,
      integration_issues_count int null,
      team_feedback text null,
      tech_stack_effectiveness jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );

    create index if not exists sop_daily_metrics_project_date_idx on public.sop_daily_metrics (project_id, metric_date desc);

    -- CRM-editable canonical SOP body + diagrams (jsonb); nullable for legacy rows.
    alter table public.sop_projects add column if not exists sop_sections jsonb null;
    alter table public.sop_projects add column if not exists diagram_bundle jsonb null;
  `);
}

export type UpsertSopProjectInput = {
  project_id?: string;
  client_id?: string | null;
  notion_workspace_url?: string | null;
  figma_file_url?: string | null;
  sop_version?: number;
  created_by: string;
  status?: SopProjectStatus;
  project_name: string;
  client_name: string;
  tech_stack?: unknown;
  notion_root_page_id?: string | null;
  notion_backlog_page_id?: string | null;
  notion_pages?: unknown;
  sop_sections?: unknown | null;
  diagram_bundle?: unknown | null;
};

export async function upsertSopProject(db: Sql, input: UpsertSopProjectInput) {
  const projectId = input.project_id ? input.project_id : crypto.randomUUID();

  const res = await db`
    insert into public.sop_projects (
      project_id,
      client_id,
      notion_workspace_url,
      figma_file_url,
      sop_version,
      created_by,
      status,
      project_name,
      client_name,
      tech_stack,
      notion_root_page_id,
      notion_backlog_page_id,
      notion_pages,
      sop_sections,
      diagram_bundle
    ) values (
      ${projectId},
      ${input.client_id ?? null},
      ${input.notion_workspace_url ?? null},
      ${input.figma_file_url ?? null},
      ${input.sop_version ?? 1.0},
      ${input.created_by},
      ${input.status ?? "draft"},
      ${input.project_name},
      ${input.client_name},
      ${(input.tech_stack ?? {}) as any},
      ${input.notion_root_page_id ?? null},
      ${input.notion_backlog_page_id ?? null},
      ${(input.notion_pages ?? {}) as any},
      ${(input.sop_sections ?? null) as any},
      ${(input.diagram_bundle ?? null) as any}
    )
    on conflict (project_id) do update set
      updated_at = now(),
      client_id = excluded.client_id,
      notion_workspace_url = excluded.notion_workspace_url,
      figma_file_url = excluded.figma_file_url,
      sop_version = excluded.sop_version,
      created_by = excluded.created_by,
      status = excluded.status,
      project_name = excluded.project_name,
      client_name = excluded.client_name,
      tech_stack = excluded.tech_stack,
      notion_root_page_id = excluded.notion_root_page_id,
      notion_backlog_page_id = excluded.notion_backlog_page_id,
      notion_pages = excluded.notion_pages,
      sop_sections = coalesce(excluded.sop_sections, public.sop_projects.sop_sections),
      diagram_bundle = coalesce(excluded.diagram_bundle, public.sop_projects.diagram_bundle)
    returning
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
      notion_pages;
  `;

  const row = Array.isArray(res) ? res[0] : (res as any);
  return row
    ? {
        project_id: String(row.project_id),
        client_id: row.client_id ? String(row.client_id) : null,
        notion_workspace_url: row.notion_workspace_url,
        figma_file_url: row.figma_file_url,
        sop_version: Number(row.sop_version ?? 1.0),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
        created_by: String(row.created_by ?? ""),
        status: (row.status as SopProjectStatus) ?? "draft",
        project_name: String(row.project_name ?? ""),
        client_name: String(row.client_name ?? ""),
        tech_stack: row.tech_stack ?? {},
        last_optimization_at: row.last_optimization_at ? String(row.last_optimization_at) : null,
        notion_root_page_id: row.notion_root_page_id ? String(row.notion_root_page_id) : null,
        notion_backlog_page_id: row.notion_backlog_page_id ? String(row.notion_backlog_page_id) : null,
        notion_pages: row.notion_pages ?? {},
        sop_sections: row.sop_sections ?? null,
        diagram_bundle: row.diagram_bundle ?? null,
      }
    : null;
}

export async function listSopProjectsCrm(db: Sql, limit = 100) {
  const rows = await db.unsafe(
    `
    select
      project_id::text as project_id,
      client_name,
      project_name,
      status,
      sop_version::float8 as sop_version,
      updated_at::text as updated_at
    from public.sop_projects
    order by updated_at desc
    limit $1
  `,
    [limit],
  );

  return (rows ?? []).map((r: any) => ({
    project_id: String(r.project_id),
    client_name: String(r.client_name ?? ""),
    project_name: String(r.project_name ?? ""),
    status: (r.status as SopProjectStatus) ?? "draft",
    sop_version: Number(r.sop_version ?? 1.0),
    updated_at: String(r.updated_at ?? ""),
  }));
}

export async function getActiveSopProjects(db: Sql, limit = 50) {
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
    where status = 'active'
    order by updated_at desc
    limit $1
  `,
    [limit],
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
    status: (r.status as SopProjectStatus) ?? "draft",
    project_name: String(r.project_name ?? ""),
    client_name: String(r.client_name ?? ""),
    tech_stack: r.tech_stack ?? {},
    last_optimization_at: r.last_optimization_at ? String(r.last_optimization_at) : null,
    notion_root_page_id: r.notion_root_page_id ? String(r.notion_root_page_id) : null,
    notion_backlog_page_id: r.notion_backlog_page_id ? String(r.notion_backlog_page_id) : null,
    notion_pages: r.notion_pages ?? {},
  }));
}

export async function getBusinessGoalsForCurrentMonth(db: Sql) {
  const monthRow = await db.unsafe(
    `
    select
      target_new_clients_month,
      target_mrr_monthly,
      target_team_size,
      target_service_offerings,
      expansion_goals
    from public.business_goals
    where month_start = date_trunc('month', now())::date
    limit 1
  `,
    [],
  );

  const r = monthRow?.[0] ?? null;
  return r
    ? {
        target_new_clients_month: r.target_new_clients_month ?? null,
        target_mrr_monthly: r.target_mrr_monthly ?? null,
        target_team_size: r.target_team_size ?? null,
        target_service_offerings: r.target_service_offerings ?? {},
        expansion_goals: r.expansion_goals ?? null,
      }
    : {
        target_new_clients_month: null,
        target_mrr_monthly: null,
        target_team_size: null,
        target_service_offerings: {},
        expansion_goals: null,
      };
}

export async function getSopProjectById(db: Sql, project_id: string) {
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
      notion_pages,
      sop_sections,
      diagram_bundle
    from public.sop_projects
    where project_id = $1
    limit 1
  `,
    [project_id],
  );

  const r = rows?.[0] ?? null;
  return r
    ? {
        project_id: String(r.project_id),
        client_id: r.client_id ? String(r.client_id) : null,
        notion_workspace_url: r.notion_workspace_url ?? null,
        figma_file_url: r.figma_file_url ?? null,
        sop_version: Number(r.sop_version ?? 1.0),
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
        created_by: String(r.created_by ?? ""),
        status: (r.status as SopProjectStatus) ?? "draft",
        project_name: String(r.project_name ?? ""),
        client_name: String(r.client_name ?? ""),
        tech_stack: r.tech_stack ?? {},
        last_optimization_at: r.last_optimization_at ? String(r.last_optimization_at) : null,
        notion_root_page_id: r.notion_root_page_id ? String(r.notion_root_page_id) : null,
        notion_backlog_page_id: r.notion_backlog_page_id ? String(r.notion_backlog_page_id) : null,
        notion_pages: r.notion_pages ?? {},
        sop_sections: r.sop_sections ?? null,
        diagram_bundle: r.diagram_bundle ?? null,
      }
    : null;
}

/** First implemented version’s after_snapshot (for legacy projects without sop_sections). */
export async function getFirstImplementedSopSnapshot(db: Sql, project_id: string): Promise<unknown | null> {
  const rows = await db.unsafe(
    `
    select after_snapshot
    from public.sop_versions
    where project_id = $1::uuid and status = 'implemented'
    order by version_number asc
    limit 1
  `,
    [project_id],
  );
  return rows?.[0]?.after_snapshot ?? null;
}

export async function getMaxSopVersionNumber(db: Sql, project_id: string): Promise<number> {
  const rows = await db.unsafe(
    `select coalesce(max(version_number), 0)::float8 as m from public.sop_versions where project_id = $1::uuid`,
    [project_id],
  );
  return Number(rows?.[0]?.m ?? 0);
}

export async function createSopVersionSuggestion(db: Sql, params: {
  project_id: string;
  version_number: number;
  change_description: string;
  changed_by: string;
  which_pages_changed: unknown;
  before_snapshot: unknown;
  after_snapshot: unknown;
  status?: SopVersionStatus;
}) {
  const out = await db.unsafe(
    `
    insert into public.sop_versions (
      project_id,
      version_number,
      change_description,
      changed_by,
      which_pages_changed,
      before_snapshot,
      after_snapshot,
      status
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8
    )
    returning id::text as id, project_id::text as project_id, version_number::float8 as version_number, status
  `,
    [
      params.project_id,
      params.version_number,
      params.change_description,
      params.changed_by,
      (params.which_pages_changed ?? []) as any,
      (params.before_snapshot ?? {}) as any,
      (params.after_snapshot ?? {}) as any,
      params.status ?? "suggested",
    ],
  );

  const row = out?.[0] ?? null;
  return row
    ? {
        id: String(row.id),
        project_id: String(row.project_id),
        version_number: Number(row.version_number ?? params.version_number),
        status: row.status as SopVersionStatus,
      }
    : null;
}

export async function setSopProjectVersionAndStatus(db: Sql, params: {
  project_id: string;
  version_number: number;
  status: SopProjectStatus;
}) {
  await db.unsafe(
    `
    update public.sop_projects
    set
      sop_version = $2,
      status = $3,
      updated_at = now()
    where project_id = $1
  `,
    [params.project_id, params.version_number, params.status],
  );
}

export type PatchSopProjectCrmInput = {
  sop_sections?: unknown | null;
  diagram_bundle?: unknown | null;
  tech_stack?: unknown;
  status?: SopProjectStatus;
  project_name?: string;
  client_name?: string;
  sop_version?: number;
};

export async function patchSopProjectCrm(db: Sql, project_id: string, patch: PatchSopProjectCrmInput) {
  const row = await getSopProjectById(db, project_id);
  if (!row) return null;

  const nextName = patch.project_name ?? row.project_name;
  const nextClient = patch.client_name ?? row.client_name;
  const nextStatus = patch.status ?? row.status;
  const nextTech = patch.tech_stack !== undefined ? patch.tech_stack : row.tech_stack;
  const nextSections = patch.sop_sections !== undefined ? patch.sop_sections : row.sop_sections;
  const nextDiagrams = patch.diagram_bundle !== undefined ? patch.diagram_bundle : row.diagram_bundle;
  const nextSopVersion = patch.sop_version !== undefined ? patch.sop_version : row.sop_version;

  const out = await db.unsafe(
    `
    update public.sop_projects set
      project_name = $2,
      client_name = $3,
      status = $4,
      tech_stack = $5::jsonb,
      sop_sections = $6::jsonb,
      diagram_bundle = $7::jsonb,
      sop_version = $8,
      updated_at = now()
    where project_id = $1::uuid
    returning
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
      notion_pages,
      sop_sections,
      diagram_bundle
  `,
    [
      project_id,
      nextName,
      nextClient,
      nextStatus,
      nextTech as any,
      nextSections == null ? null : nextSections,
      nextDiagrams == null ? null : nextDiagrams,
      nextSopVersion,
    ],
  );

  const r = out?.[0] ?? null;
  return r
    ? {
        project_id: String(r.project_id),
        client_id: r.client_id ? String(r.client_id) : null,
        notion_workspace_url: r.notion_workspace_url ?? null,
        figma_file_url: r.figma_file_url ?? null,
        sop_version: Number(r.sop_version ?? 1.0),
        created_at: String(r.created_at),
        updated_at: String(r.updated_at),
        created_by: String(r.created_by ?? ""),
        status: (r.status as SopProjectStatus) ?? "draft",
        project_name: String(r.project_name ?? ""),
        client_name: String(r.client_name ?? ""),
        tech_stack: r.tech_stack ?? {},
        last_optimization_at: r.last_optimization_at ? String(r.last_optimization_at) : null,
        notion_root_page_id: r.notion_root_page_id ? String(r.notion_root_page_id) : null,
        notion_backlog_page_id: r.notion_backlog_page_id ? String(r.notion_backlog_page_id) : null,
        notion_pages: r.notion_pages ?? {},
        sop_sections: r.sop_sections ?? null,
        diagram_bundle: r.diagram_bundle ?? null,
      }
    : null;
}

export async function approveSopVersionById(db: Sql, id: string, changed_by: string) {
  const out = await db.unsafe(
    `
    update public.sop_versions
    set
      status = 'approved',
      changed_by = $2,
      changed_at = now()
    where id = $1
    returning id::text as id, project_id::text as project_id, version_number::float8 as version_number
  `,
    [id, changed_by],
  );

  return out?.[0]
    ? { id: String(out[0].id), project_id: String(out[0].project_id), version_number: Number(out[0].version_number ?? 0) }
    : null;
}

