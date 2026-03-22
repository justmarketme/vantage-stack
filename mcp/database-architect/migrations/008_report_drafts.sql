-- Draft avatar explainer videos (Agent: avatar-generator MCP)

create table if not exists public.report_drafts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  video_url text not null,
  video_type text not null,
  script_content text not null,
  avatar_description text,
  status text not null default 'draft',
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);

create index if not exists report_drafts_client_created_idx on public.report_drafts (client_id, created_at desc);
