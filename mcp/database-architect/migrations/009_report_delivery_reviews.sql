-- CRM report approval / delivery draft state (Agent 5 handoff)

create table if not exists public.report_delivery_reviews (
  report_id uuid primary key references public.reports(id) on delete cascade,
  status text not null default 'draft',
  subject text,
  body_text text,
  personalization_notes text,
  recipients jsonb not null default '{"primary":"","additional":[]}'::jsonb,
  channels jsonb not null default '{"email":true,"whatsapp":false,"pdf":false}'::jsonb,
  scheduled_for timestamptz,
  customization jsonb not null default '{}'::jsonb,
  updated_by text not null default '',
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_by text,
  sent_channels jsonb
);

create index if not exists report_delivery_reviews_status_idx on public.report_delivery_reviews (status);
