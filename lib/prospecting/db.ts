import type { Sql } from "postgres";
import { connectCrmDb } from "../crm/db";

const schemaEnsured = new WeakSet<object>();

export async function ensureProspectingSchema(db: Sql) {
  if (schemaEnsured.has(db as unknown as object)) return;
  schemaEnsured.add(db as unknown as object);

  await Promise.all([
    db.unsafe(`
      create table if not exists public.prospects (
        id uuid primary key default gen_random_uuid(),
        source_platform text not null,
        source_url text not null default '',
        source_text text not null default '',
        discovered_at timestamptz not null default now(),
        name text,
        contact_email text,
        contact_phone text,
        contact_whatsapp text,
        business_name text,
        cipc_registration text,
        website_url text,
        social_profiles jsonb not null default '{}'::jsonb,
        company_size_estimate text,
        industry_vertical text,
        pain_point text not null default '',
        intent_signals text[] not null default '{}',
        track text not null default 'standard',
        confidence_flag text not null default 'yellow',
        stage text not null default 'new',
        routed_landing_page text,
        research_findings jsonb not null default '{}'::jsonb,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists prospects_stage_idx on public.prospects (stage);
      create index if not exists prospects_track_idx on public.prospects (track);
      create index if not exists prospects_platform_idx on public.prospects (source_platform);
      create index if not exists prospects_confidence_idx on public.prospects (confidence_flag);
      create index if not exists prospects_created_idx on public.prospects (created_at desc);
      create index if not exists prospects_discovered_idx on public.prospects (discovered_at desc);
    `),
    db.unsafe(`
      create table if not exists public.prospect_engagements (
        id uuid primary key default gen_random_uuid(),
        prospect_id uuid not null references public.prospects(id) on delete cascade,
        run_id uuid,
        channel text not null,
        direction text not null default 'outbound',
        message_text text not null default '',
        cta_type text,
        cta_url text,
        status text not null default 'draft',
        approved_by text,
        approved_at timestamptz,
        posted_at timestamptz,
        response_text text,
        responded_at timestamptz,
        thread_url text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists engagements_prospect_idx on public.prospect_engagements (prospect_id, created_at desc);
      create index if not exists engagements_status_idx on public.prospect_engagements (status);
      create index if not exists engagements_run_idx on public.prospect_engagements (run_id);
    `),
    db.unsafe(`
      create table if not exists public.prospecting_runs (
        id uuid primary key default gen_random_uuid(),
        trigger text not null default 'manual',
        started_at timestamptz not null default now(),
        finished_at timestamptz,
        channels_scanned text[] not null default '{}',
        signals_found integer not null default 0,
        leads_created integer not null default 0,
        drafts_created integer not null default 0,
        hot_leads_flagged integer not null default 0,
        status text not null default 'running',
        summary jsonb not null default '{}'::jsonb,
        error jsonb
      );
      create index if not exists runs_status_idx on public.prospecting_runs (status);
      create index if not exists runs_started_idx on public.prospecting_runs (started_at desc);
    `),
    db.unsafe(`
      create table if not exists public.prospecting_channels (
        id uuid primary key default gen_random_uuid(),
        platform text not null,
        channel_name text not null,
        channel_url text not null default '',
        track text not null default 'standard',
        enabled boolean not null default true,
        scan_priority integer not null default 5,
        last_scanned_at timestamptz,
        conversion_rate real not null default 0,
        metadata jsonb not null default '{}'::jsonb
      );
      create unique index if not exists channels_platform_name_idx on public.prospecting_channels (platform, channel_name);
    `),
    db.unsafe(`
      create table if not exists public.prospecting_metrics (
        id uuid primary key default gen_random_uuid(),
        period_start date not null,
        period_end date not null,
        platform text not null,
        channel_name text,
        track text not null,
        signals_scanned integer not null default 0,
        leads_created integer not null default 0,
        leads_contacted integer not null default 0,
        leads_responded integer not null default 0,
        calls_booked integer not null default 0,
        deals_closed integer not null default 0,
        top_pain_points jsonb not null default '[]'::jsonb,
        top_messages jsonb not null default '[]'::jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists metrics_period_idx on public.prospecting_metrics (period_start, period_end);
      create index if not exists metrics_platform_idx on public.prospecting_metrics (platform);
    `),
  ]);
}

export async function connectProspectingDb(): Promise<Sql | null> {
  const db = await connectCrmDb();
  if (!db) return null;
  await ensureProspectingSchema(db);
  return db;
}
