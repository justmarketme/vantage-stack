import postgres, { type Sql } from "postgres";

function env(name: string) {
  return (process.env[name] || "").trim();
}

export function getAnalyticsDbUrl(): string | null {
  const url =
    env("DATABASE_URL") ||
    env("SUPABASE_DB_URL") ||
    env("REPORTS_PG_URL") ||
    env("BRIEFING_PG_URL") ||
    env("WEEKLY_PG_URL") ||
    "";
  return url ? url : null;
}

export function connectAnalyticsDb(): Sql | null {
  const url = getAnalyticsDbUrl();
  if (!url) return null;
  return postgres(url, { max: 5, prepare: false });
}

export async function ensureAnalyticsTables(db: Sql) {
  // gen_random_uuid() requires pgcrypto; ensure it exists for analytics-first local/dev usage.
  await db.unsafe(`create extension if not exists "pgcrypto";`);
  // Keep this idempotent so the MCP can be used in dev without migrations applied yet.
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

