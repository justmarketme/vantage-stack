-- CRM nerve-center extensions (notes, activity, intelligence, task fields, client ops fields)

create extension if not exists "pgcrypto";

alter table public.clients
  add column if not exists company text;

alter table public.clients
  add column if not exists next_action text;

alter table public.clients
  add column if not exists assigned_to text;

alter table public.clients
  add column if not exists sop_project_id uuid;

alter table public.clients
  add column if not exists created_by text;

alter table public.tasks
  add column if not exists assigned_to text;

alter table public.tasks
  add column if not exists priority text;

create index if not exists clients_status_created_idx on public.clients (status, created_at desc);
create index if not exists clients_assigned_to_idx on public.clients (assigned_to);
create index if not exists reports_client_created_idx on public.reports (client_id, created_at desc);
create index if not exists tasks_due_date_idx on public.tasks (due_date asc nulls last);

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  author text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_notes_client_idx on public.client_notes (client_id, created_at desc);

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

create table if not exists public.client_audit_log (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  changed_by text not null default '',
  changes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists client_audit_log_client_idx on public.client_audit_log (client_id, created_at desc);
