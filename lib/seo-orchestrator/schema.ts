import type { Sql } from "postgres";

// Idempotent runtime DDL for the SEO orchestrator (mirrors the ensureCrmSchema
// pattern in lib/crm/db.ts). App DB is Supabase project tinkmipmxunwvyemhalu —
// reached via the postgres driver against DATABASE_URL, never the Supabase MCP.

const ensured = new WeakSet<object>();

export async function ensureSeoSchema(db: Sql): Promise<void> {
  if (ensured.has(db as unknown as object)) return;

  await db.unsafe(`create extension if not exists "pgcrypto";`);
  await db.unsafe(`
    create table if not exists public.seo_events (
      id uuid primary key default gen_random_uuid(),
      ts timestamptz not null default now(),
      agent text not null,
      task text not null,
      status text not null,
      progress int not null default 0,
      meta jsonb not null default '{}'::jsonb
    );
    create index if not exists idx_seo_events_ts on public.seo_events(ts desc);

    create table if not exists public.seo_keyword_queue (
      id uuid primary key default gen_random_uuid(),
      keyword text not null,
      pillar text,
      status text not null default 'candidate',
      surfaced_at timestamptz not null default now(),
      meta jsonb not null default '{}'::jsonb
    );
    create unique index if not exists idx_seo_keyword_unique on public.seo_keyword_queue(lower(keyword));

    create table if not exists public.seo_pipeline (
      id uuid primary key default gen_random_uuid(),
      piece_id text unique not null,
      title text not null,
      status text not null default 'draft',
      pillar text,
      owner_next text,
      platform_targets text[] not null default '{}',
      scheduled_publish text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      meta jsonb not null default '{}'::jsonb
    );

    create table if not exists public.seo_handoffs (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      to_party text not null default 'cowork',
      job text,
      item text not null,
      status text not null default 'ready',
      meta jsonb not null default '{}'::jsonb
    );
    create index if not exists idx_seo_handoffs_status on public.seo_handoffs(status, created_at desc);
  `);

  ensured.add(db as unknown as object);
}
