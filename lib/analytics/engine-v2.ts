import type { Sql } from "postgres";

export type DateRange = { start_date?: string; end_date?: string };

export type TrackEventInput = {
  client_id: string;
  event_type:
    | "blueprint_submitted"
    | "report_generated"
    | "report_sent"
    | "proposal_sent"
    | "proposal_accepted"
    | "client_activated"
    | "upsell_sent"
    | "upsell_accepted";
  timestamp?: string;
  metadata?: Record<string, unknown>;
};

export async function trackClientEvent(db: Sql, input: TrackEventInput) {
  const ts = toDateOrNull(input.timestamp) ?? new Date();
  const metadata = input.metadata ?? {};
  const rows = await db<
    Array<{ id: string; client_id: string; event_type: string; timestamp: string; metadata: unknown }>
  >`
    insert into public.events (client_id, event_type, timestamp, metadata)
    values (${input.client_id}::uuid, ${input.event_type}, ${ts.toISOString()}::timestamptz, ${metadata as any}::jsonb)
    returning id, client_id::text, event_type, timestamp::text, metadata
  `;
  return { ok: true, event: rows[0] ?? null };
}

function toDateOrNull(s?: string) {
  const v = (s || "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function clampRange(params: DateRange) {
  const end = toDateOrNull(params.end_date) ?? new Date();
  const start = toDateOrNull(params.start_date) ?? new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (start > end) return { start: end, end: start };
  return { start, end };
}

function startOfWeekUTC(d: Date) {
  const x = new Date(d);
  // ISO-ish: Monday as start.
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function seriesBucketLabel(d: Date, granularity: "day" | "week" | "month") {
  if (granularity === "day") return isoDate(d);
  if (granularity === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  // week label: Monday date
  const w = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (w.getUTCDay() + 6) % 7;
  w.setUTCDate(w.getUTCDate() - day);
  return `${isoDate(w)}`;
}

async function ensureDealsAndChurnSchema(db: Sql) {
  // Best-effort: makes the analytics MCP usable even if migrations haven't been applied yet.
  await db.unsafe(`create extension if not exists "pgcrypto";`);

  await db.unsafe(`
    alter table public.clients
      add column if not exists last_active_at timestamptz;
  `);
  await db.unsafe(`
    alter table public.clients
      add column if not exists activated_at timestamptz;
  `);
  await db.unsafe(`
    alter table public.clients
      add column if not exists churn_date timestamptz;
  `);

  await db.unsafe(`
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
  `);

  await db.unsafe(`
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
  `);
  await db.unsafe(`
    drop trigger if exists trg_clients_set_activated_at on public.clients;
    create trigger trg_clients_set_activated_at
    before update on public.clients
    for each row
    execute function public.set_activated_at();
  `);

  await db.unsafe(`
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
  `);
  await db.unsafe(`
    drop trigger if exists trg_clients_set_churn_date on public.clients;
    create trigger trg_clients_set_churn_date
    before update on public.clients
    for each row
    execute function public.set_churn_date();
  `);

  await db.unsafe(`
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
  `);
}

async function autoMarkChurn(db: Sql) {
  try {
    await db.unsafe(`select public.auto_mark_churned_inactive_clients();`);
  } catch {
    // best-effort
  }
}

async function computeChurnRate(db: Sql) {
  // churn_rate = churned_this_month / active_clients_at_start_of_month * 100
  const rows = await db<
    Array<{ churned_this_month: number; active_at_start: number; churn_rate: number | null }>
  >`
    with
      month_start as (select date_trunc('month', now()) as ts),
      month_end as (select (date_trunc('month', now()) + interval '1 month') as ts),
      active_start as (
        select count(*)::int as active_at_start
        from public.clients c
        cross join month_start ms
        where
          c.activated_at is not null
          and c.activated_at <= ms.ts
          and (c.churn_date is null or c.churn_date >= ms.ts)
      ),
      churned_month as (
        select count(*)::int as churned_this_month
        from public.clients c
        cross join month_start ms
        cross join month_end me
        where c.churn_date >= ms.ts and c.churn_date < me.ts
      )
    select
      churned_month.churned_this_month,
      active_start.active_at_start,
      case
        when active_start.active_at_start > 0
          then (churned_month.churned_this_month::float8 / active_start.active_at_start::float8) * 100
        else 0
      end as churn_rate
    from churned_month, active_start
  `;

  const r = rows[0] ?? { churned_this_month: 0, active_at_start: 0, churn_rate: 0 };
  return {
    churned_this_month: Number(r.churned_this_month ?? 0),
    active_at_start: Number(r.active_at_start ?? 0),
    churn_rate: Number(r.churn_rate ?? 0),
  };
}

export async function analyzeFunnel(db: Sql, params: DateRange) {
  const range = clampRange(params);
  await ensureDealsAndChurnSchema(db);

  const steps = await db<Array<{ step: string; clients: number }>>`
    with
      blueprint as (
        select count(*)::int as clients
        from public.clients
        where created_at >= ${range.start.toISOString()}::timestamptz
          and created_at < ${range.end.toISOString()}::timestamptz
      ),
      report_generated as (
        select count(distinct client_id)::int as clients
        from public.reports
        where report_generated = true
          and created_at >= ${range.start.toISOString()}::timestamptz
          and created_at < ${range.end.toISOString()}::timestamptz
      ),
      report_sent as (
        select count(distinct client_id)::int as clients
        from public.reports
        where sent_at is not null
          and sent_at >= ${range.start.toISOString()}::timestamptz
          and sent_at < ${range.end.toISOString()}::timestamptz
      ),
      proposal_sent as (
        select count(distinct client_id)::int as clients
        from public.deals
        where proposal_status = 'sent'
          and coalesce(sent_at, created_at) >= ${range.start.toISOString()}::timestamptz
          and coalesce(sent_at, created_at) < ${range.end.toISOString()}::timestamptz
      ),
      proposal_accepted as (
        select count(distinct client_id)::int as clients
        from public.deals
        where proposal_status = 'accepted'
          and accepted_at is not null
          and accepted_at >= ${range.start.toISOString()}::timestamptz
          and accepted_at < ${range.end.toISOString()}::timestamptz
      ),
      client_activated as (
        select count(*)::int as clients
        from public.clients
        where status = 'active-client'
          and activated_at is not null
          and activated_at >= ${range.start.toISOString()}::timestamptz
          and activated_at < ${range.end.toISOString()}::timestamptz
      ),
      upsell_sent as (
        select count(distinct client_id)::int as clients
        from public.upsells
        where status = 'sent'
          and coalesce(sent_at, created_at) >= ${range.start.toISOString()}::timestamptz
          and coalesce(sent_at, created_at) < ${range.end.toISOString()}::timestamptz
      ),
      upsell_accepted as (
        select count(distinct client_id)::int as clients
        from public.upsells
        where status = 'accepted'
          and coalesce(sent_at, created_at) >= ${range.start.toISOString()}::timestamptz
          and coalesce(sent_at, created_at) < ${range.end.toISOString()}::timestamptz
      )
    select 'blueprint_submitted' as step, (select clients from blueprint) as clients
    union all select 'report_generated', (select clients from report_generated)
    union all select 'report_sent', (select clients from report_sent)
    union all select 'proposal_sent', (select clients from proposal_sent)
    union all select 'proposal_accepted', (select clients from proposal_accepted)
    union all select 'client_activated', (select clients from client_activated)
    union all select 'upsell_sent', (select clients from upsell_sent)
    union all select 'upsell_accepted', (select clients from upsell_accepted)
  `;

  const map = new Map(steps.map((s) => [s.step, Number(s.clients ?? 0)] as const));
  const ordered = [
    "blueprint_submitted",
    "report_generated",
    "report_sent",
    "proposal_sent",
    "proposal_accepted",
    "client_activated",
    "upsell_sent",
    "upsell_accepted",
  ] as const;

  const funnelSteps = ordered.map((k) => ({ step: k, clients: map.get(k) ?? 0 }));
  const conversions = funnelSteps.map((s, idx) => {
    if (idx === 0) return { from: null as string | null, to: s.step, rate: null as number | null };
    const prev = funnelSteps[idx - 1].clients;
    const cur = s.clients;
    return { from: funnelSteps[idx - 1].step, to: s.step, rate: prev > 0 ? cur / prev : null };
  });

  return {
    ok: true,
    range: { start_date: isoDate(range.start), end_date: isoDate(range.end) },
    steps: funnelSteps,
    conversions,
  };
}

export async function calculateBusinessMetrics(db: Sql, params: DateRange) {
  const range = clampRange(params);
  await ensureDealsAndChurnSchema(db);
  await autoMarkChurn(db);

  const now = new Date();
  const weekStart = startOfWeekUTC(now);
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const pipelineClientsRow = await db<Array<{ total: number }>>`
    select count(*)::int as total
    from public.clients
    where status <> 'churned'
  `;
  const totalClientsInPipeline = Number(pipelineClientsRow[0]?.total ?? 0);

  const weekBlueprintRow = await db<Array<{ count: number }>>`
    select count(*)::int as count
    from public.clients
    where created_at >= ${weekStart.toISOString()}::timestamptz
      and created_at < ${weekEnd.toISOString()}::timestamptz
  `;
  const newBlueprintSubmissionsThisWeek = Number(weekBlueprintRow[0]?.count ?? 0);

  const weekReportsRow = await db<Array<{ count: number }>>`
    select count(distinct client_id)::int as count
    from public.reports
    where report_generated = true
      and created_at >= ${weekStart.toISOString()}::timestamptz
      and created_at < ${weekEnd.toISOString()}::timestamptz
  `;
  const reportsGeneratedThisWeek = Number(weekReportsRow[0]?.count ?? 0);

  const proposalCounts = await db<
    Array<{
      proposal_sent_clients: number;
      proposal_accepted_clients: number;
      activated_clients: number;
    }>
  >`
    with
      sent as (
        select distinct client_id
        from public.deals
        where proposal_status = 'sent'
          and coalesce(sent_at, created_at) >= ${range.start.toISOString()}::timestamptz
          and coalesce(sent_at, created_at) < ${range.end.toISOString()}::timestamptz
      ),
      accepted as (
        select distinct client_id
        from public.deals
        where proposal_status = 'accepted'
          and accepted_at is not null
          and accepted_at >= ${range.start.toISOString()}::timestamptz
          and accepted_at < ${range.end.toISOString()}::timestamptz
      ),
      activated as (
        select distinct c.id::text as client_id
        from public.clients c
        where c.status = 'active-client'
          and c.activated_at is not null
          and c.activated_at >= ${range.start.toISOString()}::timestamptz
          and c.activated_at < ${range.end.toISOString()}::timestamptz
          and exists (select 1 from accepted a where a.client_id::text = c.id::text)
      )
    select
      (select count(*) from sent)::int as proposal_sent_clients,
      (select count(*) from accepted)::int as proposal_accepted_clients,
      (select count(*) from activated)::int as activated_clients
  `;

  const proposalSentClients = Number(proposalCounts[0]?.proposal_sent_clients ?? 0);
  const proposalAcceptedClients = Number(proposalCounts[0]?.proposal_accepted_clients ?? 0);
  const activatedClients = Number(proposalCounts[0]?.activated_clients ?? 0);

  const proposalConversionRate =
    proposalSentClients > 0 ? proposalAcceptedClients / proposalSentClients : null;
  const clientActivationRate = proposalAcceptedClients > 0 ? activatedClients / proposalAcceptedClients : null;

  // Upsell conversion derived from upsells table if present.
  const upsellCounts = await db<Array<{ sent: number; accepted: number }>>`
    with
      sent as (
        select distinct client_id
        from public.upsells
        where status = 'sent'
          and coalesce(sent_at, created_at) >= ${range.start.toISOString()}::timestamptz
          and coalesce(sent_at, created_at) < ${range.end.toISOString()}::timestamptz
      ),
      accepted as (
        select distinct client_id
        from public.upsells
        where status = 'accepted'
          and coalesce(sent_at, created_at) >= ${range.start.toISOString()}::timestamptz
          and coalesce(sent_at, created_at) < ${range.end.toISOString()}::timestamptz
      )
    select
      (select count(*) from sent)::int as sent,
      (select count(*) from accepted)::int as accepted
  `;
  const upsellSent = Number(upsellCounts[0]?.sent ?? 0);
  const upsellAccepted = Number(upsellCounts[0]?.accepted ?? 0);
  const upsellConversionRate = upsellSent > 0 ? upsellAccepted / upsellSent : null;

  // Average times: blueprint -> report, report -> activation
  const durationRows = await db<
    Array<{ avg_blueprint_to_report_days: number | null; avg_report_to_activation_days: number | null }>
  >`
    with
      blueprint as (
        select id::uuid as client_id, created_at as blueprint_ts
        from public.clients
        where created_at >= ${range.start.toISOString()}::timestamptz
          and created_at < ${range.end.toISOString()}::timestamptz
      ),
      first_report as (
        select
          r.client_id,
          min(r.created_at) filter (where r.report_generated = true) as report_generated_ts,
          min(r.sent_at) filter (where r.sent_at is not null) as report_sent_ts
        from public.reports r
        group by r.client_id
      )
    select
      avg(extract(epoch from (fr.report_generated_ts - b.blueprint_ts)))/86400 as avg_blueprint_to_report_days,
      avg(extract(epoch from (c.activated_at - coalesce(fr.report_sent_ts, fr.report_generated_ts))))/86400 as avg_report_to_activation_days
    from blueprint b
    join first_report fr on fr.client_id = b.client_id
    join public.clients c on c.id = b.client_id
    where fr.report_generated_ts is not null
      and c.activated_at is not null
  `;
  const duration = durationRows[0] ?? { avg_blueprint_to_report_days: null, avg_report_to_activation_days: null };

  // MRR: accepted deals + accepted upsells (if your upsells table uses status='accepted')
  const revenueRows = await db<Array<{ mrr: number; arpc: number }>>`
    with
      accepted_deals as (
        select sum(deal_value)::float8 as mrr
        from public.deals
        where proposal_status = 'accepted'
          and accepted_at is not null
      ),
      accepted_upsells as (
        select sum(projected_revenue)::float8 as upsell_mrr
        from public.upsells
        where status = 'accepted'
      ),
      active_clients as (
        select count(*)::int as active_clients
        from public.clients
        where status = 'active-client'
      )
    select
      coalesce(ad.mrr,0) + coalesce(au.upsell_mrr,0) as mrr,
      case
        when ac.active_clients > 0
          then (coalesce(ad.mrr,0) + coalesce(au.upsell_mrr,0)) / ac.active_clients::float8
        else 0
      end as arpc
    from accepted_deals ad, accepted_upsells au, active_clients ac
  `;
  const revenue = revenueRows[0] ?? { mrr: 0, arpc: 0 };

  // Pipeline value: all in-flight deals + non-accepted upsells projected revenue (best-effort)
  const pipelineValueRows = await db<Array<{ pipeline_value: number }>>`
    with deal_pipe as (
      select coalesce(sum(deal_value),0)::float8 as deal_value
      from public.deals
      where proposal_status in ('draft','sent')
    ),
    upsell_pipe as (
      select coalesce(sum(projected_revenue),0)::float8 as upsell_value
      from public.upsells
      where status in ('pending','sent')
    )
    select (deal_pipe.deal_value + upsell_pipe.upsell_value)::float8 as pipeline_value
    from deal_pipe, upsell_pipe
  `;
  const total_pipeline_value = Number(pipelineValueRows[0]?.pipeline_value ?? 0);

  const churn = await computeChurnRate(db);

  return {
    ok: true,
    range: { start_date: isoDate(range.start), end_date: isoDate(range.end) },
    metrics: {
      total_clients_in_pipeline: totalClientsInPipeline,
      new_blueprint_submissions_this_week: newBlueprintSubmissionsThisWeek,
      reports_generated_this_week: reportsGeneratedThisWeek,
      proposal_conversion_rate: proposalConversionRate,
      client_activation_rate: clientActivationRate,
      upsell_conversion_rate: upsellConversionRate,
      avg_time_blueprint_to_report_days: duration.avg_blueprint_to_report_days ?? null,
      avg_time_report_to_activation_days: duration.avg_report_to_activation_days ?? null,
      monthly_recurring_revenue: revenue.mrr,
      average_revenue_per_client: revenue.arpc,
      total_pipeline_value,
      churn_rate: churn.churn_rate,
    },
    assumptions: {
      churn_rate: "churned_this_month / active_at_start_of_month * 100, based on clients.churn_date + activated/created_at",
      mrr: "sum(deals.deal_value) for accepted deals + sum(upsells.projected_revenue) for upsells.status='accepted'",
      pipeline_value: "sum(deals.deal_value) for draft/sent + sum(upsells.projected_revenue) for pending/sent",
      durations: "blueprint=clients.created_at; report=first reports.report_generated; activation=clients.activated_at; report->activation uses sent_at when available",
    },
  };
}

export async function generateRevenueChartData(
  db: Sql,
  params: DateRange & { granularity?: "day" | "week" | "month" },
) {
  const range = clampRange(params);
  const granularity = params.granularity ?? "day";
  await ensureDealsAndChurnSchema(db);

  const buckets = new Map<string, number>();

  const acceptedDeals = await db<Array<{ ts: string; value: number }>>`
    select
      accepted_at::timestamptz as ts,
      deal_value as value
    from public.deals
    where proposal_status = 'accepted'
      and accepted_at is not null
      and accepted_at >= ${range.start.toISOString()}::timestamptz
      and accepted_at < ${range.end.toISOString()}::timestamptz
  `;
  for (const r of acceptedDeals) {
    const label = seriesBucketLabel(new Date(r.ts), granularity);
    buckets.set(label, (buckets.get(label) ?? 0) + Number(r.value ?? 0));
  }

  const acceptedUpsells = await db<Array<{ ts: string; value: number }>>`
    select
      coalesce(sent_at, created_at)::timestamptz as ts,
      projected_revenue as value
    from public.upsells
    where status = 'accepted'
      and coalesce(sent_at, created_at) >= ${range.start.toISOString()}::timestamptz
      and coalesce(sent_at, created_at) < ${range.end.toISOString()}::timestamptz
  `;
  for (const r of acceptedUpsells) {
    const label = seriesBucketLabel(new Date(r.ts), granularity);
    buckets.set(label, (buckets.get(label) ?? 0) + Number(r.value ?? 0));
  }

  const labels = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b));
  const values = labels.map((l) => buckets.get(l) ?? 0);

  const metrics = await calculateBusinessMetrics(db, params);
  const forecast = await forecastNextMonthRevenue(db);

  return {
    ok: true,
    range: { start_date: isoDate(range.start), end_date: isoDate(range.end) },
    charts: {
      mrr_delta: { labels, datasets: [{ label: "MRR added (deals + accepted upsells)", data: values }] },
      snapshot: { mrr: metrics.metrics.monthly_recurring_revenue, arpc: metrics.metrics.average_revenue_per_client },
      forecast_next_month: forecast,
    },
  };
}

async function historicalConversionRates(db: Sql) {
  const ninetyDaysAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db<
    Array<{
      proposal_sent: number;
      proposal_accepted: number;
      accept_to_activate: number | null;
    }>
  >`
    with
      sent as (
        select distinct client_id
        from public.deals
        where proposal_status = 'sent'
          and coalesce(sent_at, created_at) >= ${ninetyDaysAgo}::timestamptz
      ),
      accepted as (
        select distinct client_id
        from public.deals
        where proposal_status = 'accepted'
          and accepted_at is not null
          and accepted_at >= ${ninetyDaysAgo}::timestamptz
      ),
      activated as (
        select distinct c.id::text as client_id
        from public.clients c
        where c.status = 'active-client'
          and c.activated_at is not null
          and c.activated_at >= ${ninetyDaysAgo}::timestamptz
          and exists (select 1 from accepted a where a.client_id::text = c.id::text)
      )
    select
      (select count(*) from sent)::int as proposal_sent,
      (select count(*) from accepted)::int as proposal_accepted,
      (select case when count(*) > 0
        then (select count(*) from activated)::float8 / (select count(*) from accepted)::float8
        else 0 end)::float8 as accept_to_activate
  `;

  const r = rows[0] ?? { proposal_sent: 0, proposal_accepted: 0, accept_to_activate: null };
  const proposal_to_accept = r.proposal_sent > 0 ? r.proposal_accepted / r.proposal_sent : 0;
  const accept_to_activate = r.accept_to_activate ?? 0;

  // Upsell conversion is handled separately for forecasting momentum.
  return { proposal_to_accept, accept_to_activate };
}

async function upsellTrend90d(db: Sql) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db<Array<{ sent: number; accepted: number; accepted_mrr: number }>>`
    with
      sent as (
        select distinct client_id
        from public.upsells
        where status = 'sent'
          and coalesce(sent_at, created_at) >= ${since}::timestamptz
      ),
      accepted as (
        select distinct client_id
        from public.upsells
        where status = 'accepted'
          and coalesce(sent_at, created_at) >= ${since}::timestamptz
      ),
      accepted_mrr as (
        select coalesce(sum(projected_revenue),0)::float8 as mrr
        from public.upsells
        where status = 'accepted'
          and coalesce(sent_at, created_at) >= ${since}::timestamptz
      )
    select
      (select count(*) from sent)::int as sent,
      (select count(*) from accepted)::int as accepted,
      (select mrr from accepted_mrr)::float8 as accepted_mrr
  `;
  const r = rows[0] ?? { sent: 0, accepted: 0, accepted_mrr: 0 };
  const upsell_to_accept = r.sent > 0 ? r.accepted / r.sent : 0;
  return { upsell_to_accept, accepted_mrr: Number(r.accepted_mrr ?? 0) };
}

async function openPipelineExpectedMrr(db: Sql) {
  // Current in-flight pipeline (draft + sent).
  const rows = await db<Array<{ pipeline_mrr: number }>>`
    select
      (coalesce(sum(deal_value),0) + coalesce((select sum(projected_revenue) from public.upsells u where u.status in ('pending','sent')),0))::float8 as pipeline_mrr
    from public.deals
    where proposal_status in ('draft','sent')
  `;
  return { open_pipeline_expected_mrr: Number(rows[0]?.pipeline_mrr ?? 0) };
}

async function forecastNextMonthRevenue(db: Sql) {
  const rates = await historicalConversionRates(db);
  const pipeline = await openPipelineExpectedMrr(db);
  const upsell = await upsellTrend90d(db);

  // Upsell momentum: use last 90d accepted MRR as a rough monthly average.
  const upsellMomentum = upsell.accepted_mrr / 3;
  const projectedPipelineMrr = pipeline.open_pipeline_expected_mrr * rates.proposal_to_accept * rates.accept_to_activate;
  const projectedUpsellMrr = upsellMomentum * (1 + Math.min(0.25, upsell.upsell_to_accept * 0.1));

  return {
    model: "v2",
    inputs: {
      open_pipeline_expected_mrr: pipeline.open_pipeline_expected_mrr,
      historical_rates_180d: rates,
      upsell_mrr_last_90d: upsell.accepted_mrr,
    },
    projection: {
      next_month_mrr_added: projectedPipelineMrr + projectedUpsellMrr,
      next_month_mrr_added_breakdown: { pipeline: projectedPipelineMrr, upsells: projectedUpsellMrr },
    },
    caveats: [
      "Forecast uses deals.proposal_status + clients.activated_at. If your activation timestamp differs, adjust the migration/triggers.",
      "Upsell forecasting uses upsells.status='accepted'/'sent' and upsells.projected_revenue.",
    ],
  };
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const cols = Array.from(
    rows.reduce((set, r) => {
      for (const k of Object.keys(r)) set.add(k);
      return set;
    }, new Set<string>()),
  );
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
    const needs = /[",\n]/.test(s);
    return needs ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc((r as any)[c])).join(","))].join("\n") + "\n";
}

export async function analyzeAndExportAnalyticsCsv(db: Sql, params: DateRange) {
  // Not currently exposed; kept for internal use.
  return toCsv([{ ...((await calculateBusinessMetrics(db, params)).metrics ?? {}) }]);
}

export async function exportAnalyticsReport(db: Sql, params: DateRange & { format: "csv" | "pdf" }) {
  const metrics = await calculateBusinessMetrics(db, params);
  const funnel = await analyzeFunnel(db, params);
  const charts = await generateRevenueChartData(db, params);

  if (params.format === "csv") {
    const flat = [{ ...metrics.metrics, start_date: metrics.range.start_date, end_date: metrics.range.end_date }];
    return {
      ok: true,
      format: "csv",
      filename: `analytics-${metrics.range.start_date}-to-${metrics.range.end_date}.csv`,
      data: toCsv(flat),
      funnel,
    };
  }

  const text = [
    `VantageStack Analytics Report`,
    `Range: ${metrics.range.start_date} → ${metrics.range.end_date}`,
    ``,
    `MRR: ${metrics.metrics.monthly_recurring_revenue}`,
    `ARPC: ${metrics.metrics.average_revenue_per_client}`,
    `Pipeline value: ${metrics.metrics.total_pipeline_value}`,
    `Proposal conversion: ${metrics.metrics.proposal_conversion_rate ?? "n/a"}`,
    `Activation rate: ${metrics.metrics.client_activation_rate ?? "n/a"}`,
    `Upsell conversion: ${metrics.metrics.upsell_conversion_rate ?? "n/a"}`,
    ``,
    `Churn rate (this month): ${metrics.metrics.churn_rate}%`,
    ``,
    `Avg blueprint → report: ${metrics.metrics.avg_time_blueprint_to_report_days ?? "n/a"} days`,
    `Avg report → activation: ${metrics.metrics.avg_time_report_to_activation_days ?? "n/a"} days`,
    ``,
    `Forecast next month MRR added: ${charts.charts.forecast_next_month.projection.next_month_mrr_added}`,
  ].join("\n");

  return {
    ok: true,
    format: "pdf",
    filename: `analytics-${metrics.range.start_date}-to-${metrics.range.end_date}.pdf.txt`,
    data: text,
    note: "This MCP returns a text-based PDF summary payload; the in-app dashboard exports a rich PDF snapshot.",
  };
}

