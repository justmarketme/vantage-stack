-- VantageStack core schema (indexes)

-- clients
create index if not exists clients_status_idx on public.clients (status);
create index if not exists clients_created_at_idx on public.clients (created_at desc);
create index if not exists clients_owner_id_idx on public.clients (owner_id);

-- reports
create index if not exists reports_client_id_idx on public.reports (client_id);
create index if not exists reports_created_at_idx on public.reports (created_at desc);
create index if not exists reports_report_type_idx on public.reports (report_type);

-- campaigns
create index if not exists campaigns_client_id_idx on public.campaigns (client_id);
create index if not exists campaigns_status_idx on public.campaigns (status);
create index if not exists campaigns_created_at_idx on public.campaigns (created_at desc);

-- tasks
create index if not exists tasks_client_id_idx on public.tasks (client_id);
create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_created_at_idx on public.tasks (created_at desc);
create index if not exists tasks_due_date_idx on public.tasks (due_date);

-- upsells
create index if not exists upsells_client_id_idx on public.upsells (client_id);
create index if not exists upsells_status_idx on public.upsells (status);
create index if not exists upsells_created_at_idx on public.upsells (created_at desc);

