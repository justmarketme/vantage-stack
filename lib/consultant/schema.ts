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
 * Wave 2 DDL — additive and idempotent, applied after CONSULTANT_DDL.
 *
 * The heart of it is the transactional outbox: Postgres triggers write a
 * `consultant_events` row (plus one delivery row per receiver) in the SAME
 * transaction as the change that caused it. A pipeline-stage change therefore
 * can never happen without its event, whether it came from the board, the
 * wrap-up sheet, the CRM or a script. The dispatcher (app code) then delivers
 * each event to n8n and to Jono's EMMA with retries and a dead-letter state.
 * Event payloads carry business facts only: no phone numbers, emails or
 * transcript text.
 */
export const CONSULTANT_DDL_V2 = /* sql */ `
  -- ── Deals: payment confirmation + commission (frozen at payment time) ─────
  alter table public.deals add column if not exists won_at timestamptz;
  alter table public.deals add column if not exists paid_at timestamptz;
  alter table public.deals add column if not exists payment_amount integer;
  alter table public.deals add column if not exists payment_reference text;
  alter table public.deals add column if not exists payment_proof_path text;
  alter table public.deals add column if not exists payment_note text;
  alter table public.deals add column if not exists payment_confirmed_by uuid references public.team_members(id) on delete set null;
  alter table public.deals add column if not exists payment_confirmed_at timestamptz;
  alter table public.deals add column if not exists commission_rate numeric(6,4);
  alter table public.deals add column if not exists commission_amount integer;
  create index if not exists deals_paid_idx on public.deals (consultant_id, paid_at) where paid_at is not null;

  -- ── Meetings (discovery / demo / follow-up) ────────────────────────────────
  create table if not exists public.consultant_meetings (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id) on delete cascade,
    consultant_id uuid not null references public.team_members(id) on delete restrict,
    kind text not null,
    status text not null default 'scheduled',
    starts_at timestamptz not null,
    ends_at timestamptz not null,
    invite_clinic boolean not null default true,
    notes text,
    status_changed_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists consultant_meetings_consultant_idx on public.consultant_meetings (consultant_id, starts_at);
  create index if not exists consultant_meetings_client_idx on public.consultant_meetings (client_id, starts_at desc);
  alter table public.consultant_meetings enable row level security;

  -- ── Calendar connections (per consultant, per provider; tokens encrypted) ──
  create table if not exists public.consultant_calendar_connections (
    consultant_id uuid not null references public.team_members(id) on delete cascade,
    provider text not null,                -- google | microsoft
    account_email text,
    refresh_token_enc text not null,       -- AES-256-GCM, key from env, never plaintext
    access_token_enc text,
    access_expires_at timestamptz,
    calendar_id text not null default 'primary',
    status text not null default 'connected',
    last_error text,
    connected_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    primary key (consultant_id, provider)
  );
  alter table public.consultant_calendar_connections enable row level security;

  create table if not exists public.consultant_meeting_sync (
    meeting_id uuid not null references public.consultant_meetings(id) on delete cascade,
    provider text not null,
    external_event_id text,
    status text not null default 'pending',  -- pending | synced | failed
    attempts integer not null default 0,
    last_error text,
    updated_at timestamptz not null default now(),
    primary key (meeting_id, provider)
  );
  alter table public.consultant_meeting_sync enable row level security;

  -- ── Why Board ─────────────────────────────────────────────────────────────
  create table if not exists public.consultant_goals (
    id uuid primary key default gen_random_uuid(),
    consultant_id uuid not null references public.team_members(id) on delete cascade,
    title text not null,
    why text not null default '',
    target_date date not null,
    metric text not null,
    target_value integer not null,
    image_path text,
    created_at timestamptz not null default now(),
    updated_at timestamptz
  );
  create index if not exists consultant_goals_consultant_idx on public.consultant_goals (consultant_id);
  alter table public.consultant_goals enable row level security;

  -- ── Training hub progress ─────────────────────────────────────────────────
  create table if not exists public.consultant_training_progress (
    consultant_id uuid not null references public.team_members(id) on delete cascade,
    module_id text not null,
    completed_at timestamptz not null default now(),
    primary key (consultant_id, module_id)
  );
  alter table public.consultant_training_progress enable row level security;

  -- ── Gamification: editable settings + awarded rewards ─────────────────────
  create table if not exists public.consultant_settings (
    key text primary key,
    value jsonb not null,
    updated_by uuid references public.team_members(id) on delete set null,
    updated_at timestamptz not null default now()
  );
  alter table public.consultant_settings enable row level security;

  create table if not exists public.consultant_rewards (
    id uuid primary key default gen_random_uuid(),
    consultant_id uuid not null references public.team_members(id) on delete cascade,
    tier text not null,
    period_key text not null,              -- '2026-10' (monthly) or '2026-Q4' (quarterly)
    reward text not null,
    achieved_at timestamptz not null default now(),
    fulfilled_at timestamptz,
    fulfilled_by uuid references public.team_members(id) on delete set null,
    unique (consultant_id, tier, period_key)
  );
  alter table public.consultant_rewards enable row level security;

  -- ── Emma messages (WhatsApp/SMS) with retry + dead-letter state ───────────
  create table if not exists public.consultant_messages (
    id uuid primary key default gen_random_uuid(),
    audience text not null,                -- lead | consultant | owner
    client_id uuid references public.clients(id) on delete set null,
    consultant_id uuid references public.team_members(id) on delete set null,
    channel text not null,                 -- whatsapp | sms
    template text not null,
    variables jsonb not null default '{}'::jsonb,
    idempotency_key text unique,
    status text not null default 'queued',
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    twilio_sid text,
    last_error text,
    created_at timestamptz not null default now(),
    sent_at timestamptz,
    updated_at timestamptz not null default now()
  );
  create index if not exists consultant_messages_due_idx on public.consultant_messages (next_attempt_at) where status in ('queued','failed');
  create index if not exists consultant_messages_client_idx on public.consultant_messages (client_id, created_at desc);
  alter table public.consultant_messages enable row level security;

  -- WhatsApp/SMS opt-outs (POPIA s.69). A lead that opted out is never messaged.
  create table if not exists public.consultant_contact_consent (
    client_id uuid primary key references public.clients(id) on delete cascade,
    opted_out_at timestamptz,
    opted_in_at timestamptz,
    source text,
    updated_at timestamptz not null default now()
  );
  alter table public.consultant_contact_consent enable row level security;

  -- Where a scraped lead's details came from (POPIA s.18 — tell them on request).
  alter table public.clients add column if not exists source_url text;
  alter table public.clients add column if not exists sourced_at timestamptz;
  alter table public.consultant_contact_consent add column if not exists opted_in_call_id uuid;

  -- ── Audit log (POPIA): access to pipeline data + every Emma interaction ───
  create table if not exists public.consultant_audit_log (
    id bigserial primary key,
    actor_id uuid,                         -- team member, null for system/n8n
    actor_kind text not null,              -- member | system | n8n | twilio
    action text not null,
    entity text not null,
    entity_id text,
    meta jsonb not null default '{}'::jsonb, -- ids and counts only, never PII
    at timestamptz not null default now()
  );
  create index if not exists consultant_audit_entity_idx on public.consultant_audit_log (entity, entity_id, at desc);
  alter table public.consultant_audit_log enable row level security;

  -- ── n8n ingress idempotency ───────────────────────────────────────────────
  create table if not exists public.consultant_ingress_keys (
    idempotency_key text primary key,
    action text not null,
    result jsonb,
    received_at timestamptz not null default now()
  );
  alter table public.consultant_ingress_keys enable row level security;

  -- ── Transactional outbox: events + one delivery row per receiver ──────────
  create table if not exists public.consultant_events (
    id uuid primary key default gen_random_uuid(),
    type text not null,
    occurred_at timestamptz not null default now(),
    client_id uuid,
    consultant_id uuid,
    payload jsonb not null
  );
  create index if not exists consultant_events_occurred_idx on public.consultant_events (occurred_at desc);
  alter table public.consultant_events enable row level security;

  create table if not exists public.consultant_event_deliveries (
    event_id uuid not null references public.consultant_events(id) on delete cascade,
    target text not null,                  -- n8n | emma_owner
    status text not null default 'pending',-- pending | sent | dead
    attempts integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    last_error text,
    sent_at timestamptz,
    primary key (event_id, target)
  );
  create index if not exists consultant_event_deliveries_due_idx on public.consultant_event_deliveries (next_attempt_at) where status = 'pending';
  alter table public.consultant_event_deliveries enable row level security;

  -- Builds the event payload from the lead + consultant and queues deliveries.
  create or replace function public.consultant_emit_event(
    p_type text, p_client_id uuid, p_consultant_id uuid, p_previous_stage text, p_data jsonb
  ) returns void language plpgsql as $fn$
  declare
    v_id uuid := gen_random_uuid();
    v_lead jsonb := null;
    v_consultant jsonb := null;
  begin
    if p_client_id is not null then
      select jsonb_build_object('id', c.id, 'clinicName', coalesce(c.company, c.name),
                                'stage', coalesce(c.sales_stage, 'new'), 'previousStage', p_previous_stage)
        into v_lead from public.clients c where c.id = p_client_id;
    end if;
    if p_consultant_id is not null then
      select jsonb_build_object('id', m.id, 'name', coalesce(nullif(m.full_name, ''), m.username))
        into v_consultant from public.team_members m where m.id = p_consultant_id;
    end if;
    insert into public.consultant_events (id, type, client_id, consultant_id, payload)
    values (v_id, p_type, p_client_id, p_consultant_id, jsonb_build_object(
      'id', v_id, 'type', p_type, 'occurredAt', to_jsonb(now()), 'vertical', 'clinics',
      'lead', v_lead, 'consultant', v_consultant, 'data', coalesce(p_data, '{}'::jsonb)));
    insert into public.consultant_event_deliveries (event_id, target)
    values (v_id, 'n8n'), (v_id, 'emma_owner');
  end $fn$;

  create or replace function public.consultant_clients_events() returns trigger language plpgsql as $fn$
  begin
    if new.vertical is distinct from 'clinics' then return new; end if;
    if tg_op = 'INSERT' then
      perform public.consultant_emit_event('lead.created', new.id, new.consultant_id, null,
        jsonb_build_object('source', new.lead_source));
      return new;
    end if;
    if new.sales_stage is distinct from old.sales_stage then
      perform public.consultant_emit_event('lead.stage_changed', new.id, new.consultant_id, old.sales_stage, '{}'::jsonb);
    end if;
    if old.consultant_id is null and new.consultant_id is not null then
      perform public.consultant_emit_event('lead.claimed', new.id, new.consultant_id, null, '{}'::jsonb);
    end if;
    return new;
  end $fn$;
  drop trigger if exists consultant_clients_events_trg on public.clients;
  create trigger consultant_clients_events_trg after insert or update of sales_stage, consultant_id
    on public.clients for each row execute function public.consultant_clients_events();

  create or replace function public.consultant_deals_events() returns trigger language plpgsql as $fn$
  begin
    if new.vertical is distinct from 'clinics' then return new; end if;
    if new.won_at is not null and (tg_op = 'INSERT' or old.won_at is null) then
      perform public.consultant_emit_event('deal.won', new.client_id, new.consultant_id, null,
        jsonb_build_object('saleValue', new.deal_value));
    end if;
    if new.paid_at is not null and (tg_op = 'INSERT' or old.paid_at is null) then
      perform public.consultant_emit_event('deal.paid', new.client_id, new.consultant_id, null,
        jsonb_build_object('amount', new.payment_amount, 'commission', new.commission_amount));
    end if;
    return new;
  end $fn$;
  drop trigger if exists consultant_deals_events_trg on public.deals;
  create trigger consultant_deals_events_trg after insert or update of won_at, paid_at
    on public.deals for each row execute function public.consultant_deals_events();

  create or replace function public.consultant_meetings_events() returns trigger language plpgsql as $fn$
  begin
    if tg_op = 'INSERT' then
      perform public.consultant_emit_event('meeting.scheduled', new.client_id, new.consultant_id, null,
        jsonb_build_object('meetingId', new.id, 'kind', new.kind, 'startsAt', to_jsonb(new.starts_at)));
    elsif new.status is distinct from old.status and new.status in ('held','no_show','cancelled') then
      perform public.consultant_emit_event('meeting.' || new.status, new.client_id, new.consultant_id, null,
        jsonb_build_object('meetingId', new.id, 'kind', new.kind, 'startsAt', to_jsonb(new.starts_at)));
    end if;
    return new;
  end $fn$;
  drop trigger if exists consultant_meetings_events_trg on public.consultant_meetings;
  create trigger consultant_meetings_events_trg after insert or update of status
    on public.consultant_meetings for each row execute function public.consultant_meetings_events();

  create or replace function public.consultant_calls_events() returns trigger language plpgsql as $fn$
  begin
    if new.status = 'completed' and old.status is distinct from 'completed' then
      perform public.consultant_emit_event('call.completed', new.client_id, new.consultant_id, null,
        jsonb_build_object('callId', new.id, 'answered', new.answered_at is not null,
                           'durationSec', new.duration_sec));
    end if;
    return new;
  end $fn$;
  drop trigger if exists consultant_calls_events_trg on public.consultant_calls;
  create trigger consultant_calls_events_trg after update of status
    on public.consultant_calls for each row execute function public.consultant_calls_events();

  create or replace function public.consultant_rewards_events() returns trigger language plpgsql as $fn$
  begin
    perform public.consultant_emit_event('reward.tier_achieved', null, new.consultant_id, null,
      jsonb_build_object('tier', new.tier, 'periodKey', new.period_key, 'reward', new.reward));
    return new;
  end $fn$;
  drop trigger if exists consultant_rewards_events_trg on public.consultant_rewards;
  create trigger consultant_rewards_events_trg after insert
    on public.consultant_rewards for each row execute function public.consultant_rewards_events();

  create or replace function public.consultant_messages_events() returns trigger language plpgsql as $fn$
  begin
    if new.status = 'dead' and old.status is distinct from 'dead' then
      perform public.consultant_emit_event('emma.message_dead', new.client_id, new.consultant_id, null,
        jsonb_build_object('messageId', new.id, 'template', new.template, 'audience', new.audience));
    end if;
    return new;
  end $fn$;
  drop trigger if exists consultant_messages_events_trg on public.consultant_messages;
  create trigger consultant_messages_events_trg after update of status
    on public.consultant_messages for each row execute function public.consultant_messages_events();
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
  await db.unsafe(CONSULTANT_DDL_V2);
  await ensureStatusValues(db, statusValues);
  ensured.add(db as unknown as object);
}
