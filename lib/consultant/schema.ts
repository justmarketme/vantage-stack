import type { Sql } from "postgres";
import { ensureTeamTables } from "../team/members";

/**
 * Consultant Portal DDL — additive and idempotent.
 *
 * The portal writes INTO the existing VantageStack CRM (`public.clients`,
 * `public.deals`, `public.client_communications`, `public.crm_activity`) and
 * tags every row it owns with `vertical = 'clinics'`, so the CRM can always tell
 * a Clinics-vertical deal from any other. Only call/transcript/note data lives in
 * new `consultant_*` tables.
 *
 * New tables have RLS enabled with no policies: the app reaches them through the
 * service-level `postgres` driver only, and PostgREST (anon/authenticated keys)
 * can read none of it — call recordings metadata and transcripts are sensitive.
 */
export const CONSULTANT_DDL = /* sql */ `
  -- ── CRM: clients (a Clinics lead IS a CRM client row) ──────────────────────
  alter table public.clients add column if not exists vertical text;
  alter table public.clients add column if not exists sales_stage text;
  alter table public.clients add column if not exists sales_stage_changed_at timestamptz;
  alter table public.clients add column if not exists consultant_id uuid references public.team_members(id) on delete set null;
  alter table public.clients add column if not exists contact_name text;
  alter table public.clients add column if not exists contact_role text;
  alter table public.clients add column if not exists phone text;
  alter table public.clients add column if not exists lead_source text;
  alter table public.clients add column if not exists lost_reason text;
  alter table public.clients add column if not exists next_action_at timestamptz;
  create index if not exists clients_vertical_idx on public.clients (vertical);
  create index if not exists clients_consultant_stage_idx on public.clients (consultant_id, sales_stage) where vertical is not null;
  create index if not exists clients_next_action_idx on public.clients (consultant_id, next_action_at) where next_action_at is not null;

  -- ── CRM: deals — commission attribution ───────────────────────────────────
  alter table public.deals add column if not exists vertical text;
  alter table public.deals add column if not exists consultant_id uuid references public.team_members(id) on delete set null;
  create index if not exists deals_vertical_idx on public.deals (vertical);
  -- One Clinics deal per lead, so concurrent stage changes can never create two.
  create unique index if not exists deals_clinics_client_uq on public.deals (client_id) where vertical = 'clinics';
  -- One CRM communication row per consultant call (the feed upserts it).
  create unique index if not exists client_communications_consultant_call_uq
    on public.client_communications ((metadata->>'consultant_call_id'))
    where channel = 'call' and metadata ? 'consultant_call_id';

  -- ── Calls ─────────────────────────────────────────────────────────────────
  create table if not exists public.consultant_calls (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id) on delete cascade,
    consultant_id uuid not null references public.team_members(id) on delete restrict,
    twilio_call_sid text unique,          -- parent leg (browser → Twilio)
    twilio_child_sid text,                -- dialled leg (Twilio → clinic)
    to_number text not null,
    status text not null default 'initiated',
    started_at timestamptz not null default now(),
    answered_at timestamptz,
    ended_at timestamptz,
    duration_sec integer,
    recording_sid text,
    recording_duration_sec integer,
    disposition text,
    next_action text,
    next_action_at timestamptz,
    summary_status text not null default 'pending',
    summary jsonb,
    summary_error text,
    summary_attempts integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists consultant_calls_client_idx on public.consultant_calls (client_id, started_at desc);
  create index if not exists consultant_calls_consultant_idx on public.consultant_calls (consultant_id, started_at desc);
  create index if not exists consultant_calls_summary_idx on public.consultant_calls (summary_status) where summary_status in ('pending','processing','failed');
  alter table public.consultant_calls enable row level security;

  -- ── Live + final transcript, one row per finalised utterance ──────────────
  create table if not exists public.consultant_call_segments (
    call_id uuid not null references public.consultant_calls(id) on delete cascade,
    seq integer not null,
    speaker text not null,
    text text not null,
    at timestamptz not null default now(),
    primary key (call_id, seq)
  );
  -- Supports the duplicate-retry check when Twilio re-delivers a transcription event.
  create index if not exists consultant_call_segments_at_idx on public.consultant_call_segments (call_id, at);
  alter table public.consultant_call_segments enable row level security;

  -- ── Notes (lead- or call-level) with full edit history ────────────────────
  create table if not exists public.consultant_notes (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id) on delete cascade,
    call_id uuid references public.consultant_calls(id) on delete cascade,
    kind text not null default 'manual',
    body text not null,
    version integer not null default 1,
    created_by uuid references public.team_members(id) on delete set null,
    created_by_name text not null,
    created_at timestamptz not null default now(),
    updated_by uuid references public.team_members(id) on delete set null,
    updated_by_name text,
    updated_at timestamptz
  );
  create index if not exists consultant_notes_client_idx on public.consultant_notes (client_id, created_at desc);
  create index if not exists consultant_notes_call_idx on public.consultant_notes (call_id) where call_id is not null;
  create unique index if not exists consultant_notes_ai_summary_uq on public.consultant_notes (call_id) where kind = 'ai_summary';
  alter table public.consultant_notes enable row level security;

  create table if not exists public.consultant_note_revisions (
    note_id uuid not null references public.consultant_notes(id) on delete cascade,
    version integer not null,
    body text not null,
    edited_by uuid references public.team_members(id) on delete set null,
    edited_by_name text not null,
    edited_at timestamptz not null default now(),
    primary key (note_id, version)
  );
  alter table public.consultant_note_revisions enable row level security;

  -- ── Coach Alex card telemetry (which cards fired, which got used) ─────────
  create table if not exists public.consultant_card_events (
    id bigserial primary key,
    call_id uuid not null references public.consultant_calls(id) on delete cascade,
    card_id text not null,
    action text not null,
    trigger_text text,
    at timestamptz not null
  );
  create index if not exists consultant_card_events_call_idx on public.consultant_card_events (call_id);
  alter table public.consultant_card_events enable row level security;

  -- ── Idempotency for offline-queued note creates ───────────────────────────
  alter table public.consultant_notes add column if not exists client_request_id uuid;
  create unique index if not exists consultant_notes_client_request_uq on public.consultant_notes (client_request_id) where client_request_id is not null;
`;

/**
 * `public.clients.status` may be a Postgres enum in production. If it is, the
 * status values the portal writes must exist on it before any insert/update.
 * Text columns are left untouched.
 */
async function ensureStatusValues(db: Sql, values: readonly string[]) {
  const rows = await db<{ udt_name: string; data_type: string }[]>`
    select udt_name, data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'clients' and column_name = 'status'
  `;
  const col = rows[0];
  if (!col || col.data_type !== "USER-DEFINED") return;
  for (const v of values) {
    // ALTER TYPE ... ADD VALUE cannot take bind parameters; values come from
    // config (validated to [a-z-]+ in config.ts), never from a request.
    await db.unsafe(`alter type public."${col.udt_name}" add value if not exists '${v}'`);
  }
}

const ensured = new WeakSet<object>();

export async function ensureConsultantSchema(db: Sql, statusValues: readonly string[]): Promise<void> {
  if (ensured.has(db as unknown as object)) return;
  await ensureTeamTables(db); // also ensures the CRM schema
  await db.unsafe(CONSULTANT_DDL);
  await ensureStatusValues(db, statusValues);
  ensured.add(db as unknown as object);
}
