-- VantageStack core schema (RLS policies)
-- Assumes Supabase auth is present; policies rely on auth.uid().

alter table public.clients enable row level security;
alter table public.reports enable row level security;
alter table public.campaigns enable row level security;
alter table public.tasks enable row level security;
alter table public.upsells enable row level security;

-- CLIENTS: owner_id = auth.uid()
drop policy if exists clients_select_own on public.clients;
create policy clients_select_own
on public.clients
for select
to authenticated
using (owner_id = auth.uid());

drop policy if exists clients_insert_own on public.clients;
create policy clients_insert_own
on public.clients
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists clients_update_own on public.clients;
create policy clients_update_own
on public.clients
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists clients_delete_own on public.clients;
create policy clients_delete_own
on public.clients
for delete
to authenticated
using (owner_id = auth.uid());

-- CHILD TABLES: join to clients ownership
-- reports
drop policy if exists reports_select_own on public.reports;
create policy reports_select_own
on public.reports
for select
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = reports.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own
on public.reports
for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = reports.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists reports_update_own on public.reports;
create policy reports_update_own
on public.reports
for update
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = reports.client_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.clients c
    where c.id = reports.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists reports_delete_own on public.reports;
create policy reports_delete_own
on public.reports
for delete
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = reports.client_id
      and c.owner_id = auth.uid()
  )
);

-- campaigns
drop policy if exists campaigns_select_own on public.campaigns;
create policy campaigns_select_own
on public.campaigns
for select
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = campaigns.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists campaigns_insert_own on public.campaigns;
create policy campaigns_insert_own
on public.campaigns
for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = campaigns.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists campaigns_update_own on public.campaigns;
create policy campaigns_update_own
on public.campaigns
for update
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = campaigns.client_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.clients c
    where c.id = campaigns.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists campaigns_delete_own on public.campaigns;
create policy campaigns_delete_own
on public.campaigns
for delete
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = campaigns.client_id
      and c.owner_id = auth.uid()
  )
);

-- tasks
drop policy if exists tasks_select_own on public.tasks;
create policy tasks_select_own
on public.tasks
for select
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = tasks.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists tasks_insert_own on public.tasks;
create policy tasks_insert_own
on public.tasks
for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = tasks.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists tasks_update_own on public.tasks;
create policy tasks_update_own
on public.tasks
for update
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = tasks.client_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.clients c
    where c.id = tasks.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists tasks_delete_own on public.tasks;
create policy tasks_delete_own
on public.tasks
for delete
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = tasks.client_id
      and c.owner_id = auth.uid()
  )
);

-- upsells
drop policy if exists upsells_select_own on public.upsells;
create policy upsells_select_own
on public.upsells
for select
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = upsells.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists upsells_insert_own on public.upsells;
create policy upsells_insert_own
on public.upsells
for insert
to authenticated
with check (
  exists (
    select 1 from public.clients c
    where c.id = upsells.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists upsells_update_own on public.upsells;
create policy upsells_update_own
on public.upsells
for update
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = upsells.client_id
      and c.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.clients c
    where c.id = upsells.client_id
      and c.owner_id = auth.uid()
  )
);

drop policy if exists upsells_delete_own on public.upsells;
create policy upsells_delete_own
on public.upsells
for delete
to authenticated
using (
  exists (
    select 1 from public.clients c
    where c.id = upsells.client_id
      and c.owner_id = auth.uid()
  )
);

