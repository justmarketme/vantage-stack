import { setDefaultResultOrder } from "node:dns";
import { platform } from "node:os";
import postgres, { type Sql } from "postgres";
import { resolveSupabaseDatabaseUrlForNode } from "./supabase-pooler-resolve";

/** Prefer IPv4 when both exist (helps some Windows / dual-stack setups). */
setDefaultResultOrder("ipv4first");

function env(name: string) {
  return (process.env[name] || "").trim();
}

export function getCrmDbUrl(): string | null {
  const url =
    env("SUPABASE_DATABASE_POOLER_URL") ||
    env("DATABASE_URL") ||
    env("SUPABASE_DB_URL") ||
    env("REPORTS_PG_URL") ||
    env("BRIEFING_PG_URL") ||
    env("WEEKLY_PG_URL") ||
    env("TELEGRAM_PG_URL") ||
    "";
  return url ? url : null;
}

/** Re-resolve when DATABASE_URL / SUPABASE_DATABASE_POOLER_URL changes (no stale cache after .env edits). */
let memoRawUrl: string | null = null;
let memoResolvedPromise: Promise<string | null> | null = null;

function memoizedResolvedConnectionString(): Promise<string | null> {
  const raw = getCrmDbUrl();
  if (!raw) {
    memoRawUrl = null;
    memoResolvedPromise = null;
    return Promise.resolve(null);
  }
  if (raw !== memoRawUrl || !memoResolvedPromise) {
    memoRawUrl = raw;
    memoResolvedPromise = resolveSupabaseDatabaseUrlForNode(raw);
  }
  return memoResolvedPromise;
}

const DIRECT_SUPABASE_DB = /^db\.[^.]+\.supabase\.co$/i;

/**
 * Opens a Postgres pool. For Supabase direct `db.<ref>.supabase.co` URLs, resolves to session pooler
 * (IPv4) on first call unless `SUPABASE_DISABLE_AUTO_POOLER=1` or you set `SUPABASE_POOLER_REGION`.
 */
function supabaseLikeUrl(url: string): boolean {
  return /supabase\.co|pooler\.supabase\.com/i.test(url);
}

/**
 * Module-level singleton pool — one shared pool for the entire Node process.
 * This is critical: creating a new pool per request exhausts Supabase’s
 * session pooler limit (pool_size) almost instantly under any real load.
 */
let _singletonPool: Sql | null = null;
let _singletonUrl: string | null = null;

/** Call this when a CONNECTION_ENDED error is detected so the next request gets a fresh pool. */
export async function resetSingletonPool(): Promise<void> {
  if (_singletonPool) {
    try { await _singletonPool.end({ timeout: 2 }); } catch { /* ignore */ }
    _singletonPool = null;
    _singletonUrl = null;
  }
}

export async function connectCrmDb(): Promise<Sql | null> {
  const url = await memoizedResolvedConnectionString();
  if (!url) return null;

  // Return existing singleton if URL hasn’t changed (covers hot-reload in dev)
  if (_singletonPool && _singletonUrl === url) return _singletonPool;

  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    /* invalid URL — let postgres throw */
  }

  /**
   * Windows + Node often cannot resolve IPv6-only `db.<ref>.supabase.co` (ENOTFOUND). If pooler
   * auto-detect failed we must not open that URL — return a fix instead of a DNS error.
   * Opt out: SUPABASE_ALLOW_DIRECT_DB=1
   */
  if (
    hostname &&
    DIRECT_SUPABASE_DB.test(hostname) &&
    platform() === "win32" &&
    process.env.SUPABASE_ALLOW_DIRECT_DB !== "1"
  ) {
    throw new Error(
      "This PC cannot use Supabase’s direct DB host (db.PROJECT.supabase.co) from Node — it usually fails on Windows. " +
        "Fix: In Supabase → Project Settings → Database → Connection pooling, copy the Session pooler connection string and add it to .env.local as SUPABASE_DATABASE_POOLER_URL=... " +
        "Or set SUPABASE_POOLER_REGION to your project’s region (e.g. eu-central-1). Then restart npm run dev. " +
        "Optional: SUPABASE_ALLOW_DIRECT_DB=1 if you have IPv6 working end-to-end.",
    );
  }

  _singletonPool = postgres(url, {
    max: 3,          // 3 is plenty — Supabase session pooler default pool_size is 15, shared across all serverless invocations
    prepare: false,
    connect_timeout: 15,
    idle_timeout: 10,
    max_lifetime: 60 * 10,
    ...(supabaseLikeUrl(url) ? { ssl: "require" as const } : {}),
  });
  _singletonUrl = url;

  return _singletonPool;
}

/**
 * Module-level cache: schema is only verified once per Node process.
 * This eliminates 14+ sequential ALTER TABLE round-trips on every API request.
 */
const schemaEnsured = new WeakSet<object>();

/** Idempotent DDL so dev / MCP works before full migrations are applied. */
export async function ensureCrmSchema(db: Sql) {
  if (schemaEnsured.has(db as unknown as object)) return;
  schemaEnsured.add(db as unknown as object);

  // Extension first (must precede everything else)
  await db.unsafe(`create extension if not exists "pgcrypto";`);

  // Run all independent DDL statements in parallel — cuts cold-start from ~1s to ~100ms
  await Promise.all([
    // Clients table extra columns
    db.unsafe(`
      alter table public.clients add column if not exists company text;
      alter table public.clients add column if not exists next_action text;
      alter table public.clients add column if not exists assigned_to text;
      alter table public.clients add column if not exists sop_project_id uuid;
      alter table public.clients add column if not exists last_active_at timestamptz;
      alter table public.clients add column if not exists activated_at timestamptz;
      alter table public.clients add column if not exists churn_date timestamptz;
      alter table public.clients add column if not exists created_by text;
      alter table public.clients add column if not exists blueprint_markdown text;
      alter table public.clients add column if not exists package_intent text;
      alter table public.clients add column if not exists service_interest text;
      create index if not exists clients_status_idx on public.clients (status);
      create index if not exists clients_created_idx on public.clients (created_at desc);
    `),
    db.unsafe(`alter table public.clients alter column owner_id drop not null;`).catch(() => {}),
    db.unsafe(`
      alter table public.tasks add column if not exists assigned_to text;
      alter table public.tasks add column if not exists priority text;
    `).catch(() => {}),
    db.unsafe(`
      create table if not exists public.client_audit_log (
        id uuid primary key default gen_random_uuid(),
        client_id uuid not null references public.clients(id) on delete cascade,
        changed_by text not null default '',
        changes jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
      create index if not exists client_audit_log_client_idx on public.client_audit_log (client_id, created_at desc);
    `),
    db.unsafe(`
      create table if not exists public.client_notes (
        id uuid primary key default gen_random_uuid(),
        client_id uuid not null references public.clients(id) on delete cascade,
        author text not null default '',
        body text not null,
        created_at timestamptz not null default now()
      );
      create index if not exists client_notes_client_idx on public.client_notes (client_id, created_at desc);
    `),
    db.unsafe(`
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
    `),
    db.unsafe(`
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
    `),
    db.unsafe(`
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
    `),
    db.unsafe(`
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
    `),
    db.unsafe(`
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
    `),
    db.unsafe(`
      create table if not exists public.events (
        id uuid primary key default gen_random_uuid(),
        client_id uuid not null references public.clients(id) on delete cascade,
        event_type text not null,
        timestamp timestamptz not null default now(),
        metadata jsonb not null default '{}'::jsonb
      );
      create index if not exists events_client_time_idx on public.events (client_id, timestamp desc);
      create index if not exists events_type_time_idx on public.events (event_type, timestamp desc);
    `),
    db.unsafe(`
      create table if not exists public.client_design_to_code (
        client_id uuid primary key references public.clients(id) on delete cascade,
        design_brief text,
        master_prompt text,
        claude_last_response text,
        generated_code_url text,
        staging_url text,
        production_url text,
        github_branch text,
        status text not null default 'draft',
        version text not null default '1.0',
        review_checklist jsonb not null default '{}'::jsonb,
        discovery_snapshot jsonb not null default '{}'::jsonb,
        competitor_analysis text,
        revision_notes text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
    );
    create index if not exists client_dtc_status_idx on public.client_design_to_code (status);
  `),
  ]);
}
