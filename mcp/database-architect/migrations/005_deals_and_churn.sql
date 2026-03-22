-- Deals + churn tracking

create extension if not exists "pgcrypto";

-- Add activity + churn timestamps to clients
alter table public.clients
  add column if not exists last_active_at timestamptz;

alter table public.clients
  add column if not exists activated_at timestamptz;

alter table public.clients
  add column if not exists churn_date timestamptz;

-- Deals (proposals)
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
create index if not exists deals_status_idx on public.deals (proposal_status);
create index if not exists deals_created_at_idx on public.deals (created_at desc);
create index if not exists deals_expected_close_date_idx on public.deals (expected_close_date);

-- RLS: deals owned by clients.owner_id
alter table public.deals enable row level security;

drop policy if exists deals_select_own on public.deals;
create policy deals_select_own
on public.deals
for select
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = deals.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists deals_insert_own on public.deals;
create policy deals_insert_own
on public.deals
for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = deals.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists deals_update_own on public.deals;
create policy deals_update_own
on public.deals
for update
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = deals.client_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.clients c
    where c.id = deals.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists deals_delete_own on public.deals;
create policy deals_delete_own
on public.deals
for delete
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = deals.client_id
      and c.owner_id = auth.uid()
  )
);

-- Triggers:
-- 1) When clients become active, stamp activated_at (first time only)
create or replace function public.set_activated_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'active-client' and (old.status is distinct from 'active-client') then
    if new.activated_at is null then
      new.activated_at = now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_set_activated_at on public.clients;
create trigger trg_clients_set_activated_at
before update on public.clients
for each row
execute function public.set_activated_at();

-- 2) When clients churn, stamp churn_date (first time only)
create or replace function public.set_churn_date()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'churned' and (old.status is distinct from 'churned') then
    if new.churn_date is null then
      new.churn_date = now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_set_churn_date on public.clients;
create trigger trg_clients_set_churn_date
before update on public.clients
for each row
execute function public.set_churn_date();

-- 3) Auto-churn inactive clients when last_activity exceeds 90 days
create or replace function public.auto_mark_churned_inactive_clients()
returns void
language plpgsql
as $$
begin
  update public.clients
  set
    status = 'churned',
    churn_date = coalesce(churn_date, now())
  where status = 'active-client'
    and churn_date is null
    and coalesce(last_active_at, activated_at, created_at) <= (now() - interval '90 days');
end;
$$;

