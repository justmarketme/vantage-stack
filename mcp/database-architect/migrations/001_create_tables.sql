-- VantageStack core schema (tables)

create extension if not exists "pgcrypto";

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  -- Ownership (required for RLS). This is intentionally additive to the requested columns.
  owner_id uuid not null default auth.uid(),

  name text not null,
  email text not null unique,
  whatsapp text,
  website_url text,
  industry text,
  revenue_range text,
  challenges jsonb,
  competitors jsonb,
  current_marketing text,
  tools_used jsonb,
  monthly_budget integer,
  success_goals text,
  status text not null default 'blueprint-submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  report_type text,
  website_score integer,
  traffic_data jsonb,
  backlink_data jsonb,
  competitor_data jsonb,
  seo_opportunities jsonb,
  conversion_critique jsonb,
  revenue_opportunity jsonb,
  upsell_suggestions jsonb,
  video_url text,
  report_generated boolean not null default false,
  research_complete boolean not null default false,
  video_complete boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  platform text,
  budget integer,
  spend integer,
  leads integer,
  conversions integer,
  cost_per_lead numeric(12, 2),
  revenue_attributed integer,
  status text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  task_type text,
  status text,
  due_date date,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.upsells (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  service_name text,
  projected_revenue integer,
  status text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- updated_at trigger for clients
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
before update on public.clients
for each row
execute function public.set_updated_at();

