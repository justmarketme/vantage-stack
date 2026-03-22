import postgres, { type Sql } from "postgres";

function env(name: string) {
  return (process.env[name] || "").trim();
}

export function getCrmDbUrl(): string | null {
  const url =
    env("DATABASE_URL") ||
    env("SUPABASE_DB_URL") ||
    env("REPORTS_PG_URL") ||
    env("BRIEFING_PG_URL") ||
    env("WEEKLY_PG_URL") ||
    env("TELEGRAM_PG_URL") ||
    "";
  return url ? url : null;
}

export function connectCrmDb(): Sql | null {
  const url = getCrmDbUrl();
  if (!url) return null;
  return postgres(url, { max: 5, prepare: false });
}

/** Idempotent DDL so dev / MCP works before full migrations are applied. */
export async function ensureCrmSchema(db: Sql) {
  await db.unsafe(`create extension if not exists "pgcrypto";`);

  await db.unsafe(`
    alter table public.clients add column if not exists company text;
    alter table public.clients add column if not exists next_action text;
    alter table public.clients add column if not exists assigned_to text;
    alter table public.clients add column if not exists sop_project_id uuid;
    alter table public.clients add column if not exists last_active_at timestamptz;
    alter table public.clients add column if not exists activated_at timestamptz;
    alter table public.clients add column if not exists churn_date timestamptz;
    alter table public.clients add column if not exists created_by text;
  `);

  await db.unsafe(`
    create table if not exists public.client_audit_log (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      changed_by text not null default '',
      changes jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists client_audit_log_client_idx on public.client_audit_log (client_id, created_at desc);
  `);

  await db.unsafe(`
    alter table public.tasks add column if not exists assigned_to text;
    alter table public.tasks add column if not exists priority text;
  `);

  await db.unsafe(`
    create table if not exists public.client_notes (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      author text not null default '',
      body text not null,
      created_at timestamptz not null default now()
    );
    create index if not exists client_notes_client_idx on public.client_notes (client_id, created_at desc);
  `);

  await db.unsafe(`
    create table if not exists public.client_communications (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      channel text not null,
      subject text,
      body_preview text,
      sent_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb
    );
    create index if not exists client_communications_client_idx on public.client_communications (client_id, sent_at desc);
  `);

  await db.unsafe(`
    create table if not exists public.intelligence_items (
      id uuid primary key default gen_random_uuid(),
      client_id uuid references public.clients(id) on delete set null,
      title text not null,
      body text,
      source text,
      severity text not null default 'info',
      created_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb
    );
    create index if not exists intelligence_client_idx on public.intelligence_items (client_id, created_at desc);
  `);

  await db.unsafe(`
    create table if not exists public.crm_activity (
      id uuid primary key default gen_random_uuid(),
      action_type text not null,
      client_id uuid references public.clients(id) on delete set null,
      user_actor text not null default '',
      details jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create index if not exists crm_activity_created_idx on public.crm_activity (created_at desc);
    create index if not exists crm_activity_client_idx on public.crm_activity (client_id, created_at desc);
  `);

  await db.unsafe(`
    create table if not exists public.telegram_command_log (
      id uuid primary key default gen_random_uuid(),
      command text not null,
      args text,
      chat_id text,
      username text,
      ok boolean not null default true,
      created_at timestamptz not null default now()
    );
    create index if not exists telegram_command_log_created_idx on public.telegram_command_log (created_at desc);
  `);

  await db.unsafe(`
    create table if not exists public.deals (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      proposal_status text not null,
      deal_value integer not null default 0,
      service_type text not null,
      created_at timestamp not null default now(),
      sent_at timestamptz,
      accepted_at timestamptz,
      expected_close_date date,
      notes text
    );
    create index if not exists deals_client_id_idx on public.deals (client_id);
  `);

  await db.unsafe(`
    create table if not exists public.report_drafts (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      report_id uuid references public.reports(id) on delete set null,
      video_url text not null,
      video_type text not null,
      script_content text not null,
      avatar_description text,
      status text not null default 'draft',
      created_by text not null default 'system',
      created_at timestamptz not null default now()
    );
    create index if not exists report_drafts_client_created_idx on public.report_drafts (client_id, created_at desc);
  `);

  await db.unsafe(`
    create table if not exists public.report_delivery_reviews (
      report_id uuid primary key references public.reports(id) on delete cascade,
      status text not null default 'draft',
      subject text,
      body_text text,
      personalization_notes text,
      recipients jsonb not null default '{"primary":"","additional":[]}'::jsonb,
      channels jsonb not null default '{"email":true,"whatsapp":false,"pdf":false}'::jsonb,
      scheduled_for timestamptz,
      customization jsonb not null default '{}'::jsonb,
      updated_by text not null default '',
      updated_at timestamptz not null default now(),
      sent_at timestamptz,
      sent_by text,
      sent_channels jsonb,
      reminder_sent_at timestamptz
    );
    create index if not exists report_delivery_reviews_status_idx on public.report_delivery_reviews (status);
  `);

  await db.unsafe(`
    alter table public.report_delivery_reviews add column if not exists reminder_sent_at timestamptz;
    alter table public.reports add column if not exists report_markdown text;
    alter table public.reports add column if not exists share_token text;
    alter table public.reports add column if not exists delivery_complete boolean not null default false;
    create unique index if not exists reports_share_token_uidx on public.reports (share_token) where share_token is not null;
  `);

  await db.unsafe(`
    create table if not exists public.events (
      id uuid primary key default gen_random_uuid(),
      client_id uuid not null references public.clients(id) on delete cascade,
      event_type text not null,
      timestamp timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb
    );
    create index if not exists events_client_time_idx on public.events (client_id, timestamp desc);
    create index if not exists events_type_time_idx on public.events (event_type, timestamp desc);
  `);
}
