-- Analytics events table (client journey tracking)

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  event_type text not null,
  timestamp timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists events_client_time_idx on public.events (client_id, timestamp desc);
create index if not exists events_type_time_idx on public.events (event_type, timestamp desc);

-- RLS (match existing pattern: own via clients.owner_id)
alter table public.events enable row level security;

drop policy if exists events_select_own on public.events;
create policy events_select_own
on public.events
for select
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = events.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists events_insert_own on public.events;
create policy events_insert_own
on public.events
for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = events.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists events_delete_own on public.events;
create policy events_delete_own
on public.events
for delete
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = events.client_id
      and c.owner_id = auth.uid()
  )
);

