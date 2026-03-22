import type { Sql } from "postgres";

type TrackEventInput = {
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

function toDateOrNull(s?: string) {
  const v = (s || "").trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function clampRange(params: { start_date?: string; end_date?: string }) {
  const end = toDateOrNull(params.end_date) ?? new Date();
  const start = toDateOrNull(params.start_date) ?? new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  if (start > end) return { start: end, end: start };
  return { start, end };
}

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

type DateRange = { start_date?: string; end_date?: string };

const FUNNEL_STEPS: Array<{ key: string; event_type: TrackEventInput["event_type"] }> = [
  { key: "blueprint_submitted", event_type: "blueprint_submitted" },
  { key: "report_generated", event_type: "report_generated" },
  { key: "report_sent", event_type: "report_sent" },
  { key: "proposal_sent", event_type: "proposal_sent" },
  { key: "proposal_accepted", event_type: "proposal_accepted" },
  { key: "client_activated", event_type: "client_activated" },
  { key: "upsell_sent", event_type: "upsell_sent" },
  { key: "upsell_accepted", event_type: "upsell_accepted" },
];

async function stepCounts(db: Sql, range: { start: Date; end: Date }) {
  const rows = await db<Array<{ event_type: string; clients: number }>>`
    select event_type, count(distinct client_id)::int as clients
    from public.events
    where timestamp >= ${range.start.toISOString()}::timestamptz
      and timestamp < ${new Date(range.end.getTime() + 24 * 60 * 60 * 1000).toISOString()}::timestamptz
    group by event_type
  `;
  const map = new Map<string, number>();
  for (const r of rows) map.set(String(r.event_type), Number(r.clients ?? 0));
  return map;
}

async function avgDurations(db: Sql) {
  // Average over clients where both events exist; use earliest occurrence.
  const rows = await db<
    Array<{
      avg_blueprint_to_report_ms: number | null;
      avg_report_to_activation_ms: number | null;
    }>
  >`
    with firsts as (
      select
        client_id,
        min(timestamp) filter (where event_type='blueprint_submitted') as blueprint_ts,
        min(timestamp) filter (where event_type='report_generated') as report_ts,
        min(timestamp) filter (where event_type='client_activated') as activated_ts
      from public.events
      group by client_id
    )
    select
      avg(extract(epoch from (report_ts - blueprint_ts)) * 1000) as avg_blueprint_to_report_ms,
      avg(extract(epoch from (activated_ts - report_ts)) * 1000) as avg_report_to_activation_ms
    from firsts
    where blueprint_ts is not null and report_ts is not null
  `;
  const r = rows[0] ?? { avg_blueprint_to_report_ms: null, avg_report_to_activation_ms: null };
  return {
    avg_time_blueprint_to_report_days:
      r.avg_blueprint_to_report_ms == null ? null : r.avg_blueprint_to_report_ms / (1000 * 60 * 60 * 24),
    avg_time_report_to_activation_days:
      r.avg_report_to_activation_ms == null ? null : r.avg_report_to_activation_ms / (1000 * 60 * 60 * 24),
  };
}

async function revenueSignals(db: Sql) {
  // MRR is derived from most recent "client_activated" / "upsell_accepted" events with metadata.monthly_revenue.
  const rows = await db<
    Array<{
      client_id: string;
      event_type: string;
      timestamp: string;
      monthly_revenue: number | null;
    }>
  >`
    with ranked as (
      select
        client_id,
        event_type,
        timestamp,
        nullif((metadata->>'monthly_revenue'), '')::numeric as monthly_revenue,
        row_number() over (partition by client_id, event_type order by timestamp desc) as rn
      from public.events
      where event_type in ('client_activated','upsell_accepted')
    )
    select client_id::text, event_type, timestamp::text, monthly_revenue::float8
    from ranked
    where rn = 1
  `;

  const perClient = new Map<string, { base: number; upsell: number }>();
  for (const r of rows) {
    const id = String(r.client_id);
    const v = Number(r.monthly_revenue ?? 0);
    if (!perClient.has(id)) perClient.set(id, { base: 0, upsell: 0 });
    const cur = perClient.get(id)!;
    if (r.event_type === "client_activated") cur.base = v;
    if (r.event_type === "upsell_accepted") cur.upsell = v;
  }

  let mrr = 0;
  let clientsWithRevenue = 0;
  for (const [, v] of perClient) {
    const total = (v.base || 0) + (v.upsell || 0);
    if (total > 0) clientsWithRevenue += 1;
    mrr += total;
  }
  return { mrr, clientsWithRevenue, arpc: clientsWithRevenue ? mrr / clientsWithRevenue : 0 };
}

async function pipelineValue(db: Sql) {
  // Pipeline value derived from latest proposal_accepted OR proposal_sent metadata.pipeline_value
  const rows = await db<
    Array<{ client_id: string; pipeline_value: number | null }>
  >`
    with ranked as (
      select
        client_id,
        nullif((metadata->>'pipeline_value'), '')::numeric as pipeline_value,
        row_number() over (partition by client_id order by timestamp desc) as rn
      from public.events
      where event_type in ('proposal_sent','proposal_accepted')
    )
    select client_id::text, pipeline_value::float8
    from ranked
    where rn = 1
  `;
  let total = 0;
  for (const r of rows) total += Number(r.pipeline_value ?? 0);
  return { total_pipeline_value: total };
}

export async function analyzeFunnel(db: Sql, params: DateRange) {
  const range = clampRange(params);
  const counts = await stepCounts(db, range);
  const steps = FUNNEL_STEPS.map((s) => ({
    step: s.key,
    clients: counts.get(s.event_type) ?? 0,
  }));
  const conversions = steps.map((s, idx) => {
    if (idx === 0) return { from: null, to: s.step, rate: null as number | null };
    const prev = steps[idx - 1].clients;
    const cur = s.clients;
    return { from: steps[idx - 1].step, to: s.step, rate: prev > 0 ? cur / prev : null };
  });
  return {
    ok: true,
    range: { start_date: isoDate(range.start), end_date: isoDate(range.end) },
    steps,
    conversions,
  };
}

export async function calculateBusinessMetrics(db: Sql, params: DateRange) {
  const range = clampRange(params);
  const counts = await stepCounts(db, range);
  const durations = await avgDurations(db);
  const revenue = await revenueSignals(db);
  const pipeline = await pipelineValue(db);

  const pipelineClientsRows = await db<Array<{ total: number }>>`
    select count(*)::int as total
    from public.clients
    where status not in ('client-activated','churned')
  `;
  const totalClientsInPipeline = Number(pipelineClientsRows[0]?.total ?? 0);

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - ((now.getUTCDay() + 6) % 7)); // Monday
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekCountsRows = await db<Array<{ event_type: string; clients: number }>>`
    select event_type, count(distinct client_id)::int as clients
    from public.events
    where timestamp >= ${weekStart.toISOString()}::timestamptz
      and event_type in ('blueprint_submitted','report_generated')
    group by event_type
  `;
  const weekCounts = new Map<string, number>();
  for (const r of weekCountsRows) weekCounts.set(String(r.event_type), Number(r.clients ?? 0));

  const proposalSent = counts.get("proposal_sent") ?? 0;
  const proposalAccepted = counts.get("proposal_accepted") ?? 0;
  const activated = counts.get("client_activated") ?? 0;
  const upsellSent = counts.get("upsell_sent") ?? 0;
  const upsellAccepted = counts.get("upsell_accepted") ?? 0;

  const churnRows = await db<Array<{ churned_30d: number; active_30d: number }>>`
    with windowed as (
      select
        event_type,
        timestamp
      from public.events
      where timestamp >= ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()}::timestamptz
    )
    select
      (select count(*)::int from windowed where event_type='churned') as churned_30d,
      (select count(distinct client_id)::int from public.events where event_type='client_activated') as active_30d
  `.catch(async () => [{ churned_30d: 0, active_30d: 0 } as any]);
  const churned = Number(churnRows[0]?.churned_30d ?? 0);
  const active = Number(churnRows[0]?.active_30d ?? 0);
  const churnRate = active > 0 ? churned / active : 0;

  return {
    ok: true,
    range: { start_date: isoDate(range.start), end_date: isoDate(range.end) },
    metrics: {
      total_clients_in_pipeline: totalClientsInPipeline,
      new_blueprint_submissions_this_week: weekCounts.get("blueprint_submitted") ?? 0,
      reports_generated_this_week: weekCounts.get("report_generated") ?? 0,
      proposal_conversion_rate: proposalSent > 0 ? proposalAccepted / proposalSent : null,
      client_activation_rate: proposalAccepted > 0 ? activated / proposalAccepted : null,
      upsell_conversion_rate: upsellSent > 0 ? upsellAccepted / upsellSent : null,
      ...durations,
      monthly_recurring_revenue: revenue.mrr,
      average_revenue_per_client: revenue.arpc,
      total_pipeline_value: pipeline.total_pipeline_value,
      churn_rate: churnRate,
    },
    assumptions: {
      revenue: "MRR is derived from latest events metadata.monthly_revenue on client_activated and upsell_accepted.",
      pipeline_value: "Pipeline value is derived from latest proposal_sent/proposal_accepted metadata.pipeline_value per client.",
    },
  };
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

export async function generateRevenueChartData(
  db: Sql,
  params: DateRange & { granularity?: "day" | "week" | "month" },
) {
  const range = clampRange(params);
  const granularity = params.granularity ?? "day";

  const rows = await db<
    Array<{ timestamp: string; event_type: string; monthly_revenue: number | null }>
  >`
    select
      timestamp::text,
      event_type,
      nullif((metadata->>'monthly_revenue'), '')::numeric::float8 as monthly_revenue
    from public.events
    where timestamp >= ${range.start.toISOString()}::timestamptz
      and timestamp < ${new Date(range.end.getTime() + 24 * 60 * 60 * 1000).toISOString()}::timestamptz
      and event_type in ('client_activated','upsell_accepted')
    order by timestamp asc
  `;

  // Naive time-series: sum of revenue deltas over time (treat each event as +monthly_revenue)
  const buckets = new Map<string, number>();
  for (const r of rows) {
    const label = seriesBucketLabel(new Date(r.timestamp), granularity);
    buckets.set(label, (buckets.get(label) ?? 0) + Number(r.monthly_revenue ?? 0));
  }
  const labels = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b));
  const values = labels.map((l) => buckets.get(l) ?? 0);

  const metrics = await calculateBusinessMetrics(db, params);
  const forecast = await forecastNextMonthRevenue(db);

  return {
    ok: true,
    range: { start_date: isoDate(range.start), end_date: isoDate(range.end) },
    charts: {
      mrr_delta: { labels, datasets: [{ label: "MRR added (from events)", data: values }] },
      snapshot: { mrr: metrics.metrics.monthly_recurring_revenue, arpc: metrics.metrics.average_revenue_per_client },
      forecast_next_month: forecast,
    },
  };
}

async function historicalConversionRates(db: Sql) {
  const rows = await db<
    Array<{ proposals_sent: number; proposals_accepted: number; activated: number; upsells_sent: number; upsells_accepted: number }>
  >`
    with base as (
      select
        count(distinct client_id) filter (where event_type='proposal_sent')::int as proposals_sent,
        count(distinct client_id) filter (where event_type='proposal_accepted')::int as proposals_accepted,
        count(distinct client_id) filter (where event_type='client_activated')::int as activated,
        count(distinct client_id) filter (where event_type='upsell_sent')::int as upsells_sent,
        count(distinct client_id) filter (where event_type='upsell_accepted')::int as upsells_accepted
      from public.events
      where timestamp >= ${new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()}::timestamptz
    )
    select * from base
  `;
  const r = rows[0] ?? {
    proposals_sent: 0,
    proposals_accepted: 0,
    activated: 0,
    upsells_sent: 0,
    upsells_accepted: 0,
  };
  return {
    proposal_to_accept: r.proposals_sent > 0 ? r.proposals_accepted / r.proposals_sent : 0,
    accept_to_activate: r.proposals_accepted > 0 ? r.activated / r.proposals_accepted : 0,
    upsell_to_accept: r.upsells_sent > 0 ? r.upsells_accepted / r.upsells_sent : 0,
  };
}

async function openPipelineRevenue(db: Sql) {
  // Expected next-month revenue from proposals in-flight (proposal_sent but not accepted/activated),
  // derived from metadata.expected_monthly_revenue or pipeline_value as a fallback scaled to monthly.
  const rows = await db<
    Array<{ client_id: string; expected_monthly_revenue: number | null; pipeline_value: number | null }>
  >`
    with last_proposal as (
      select
        client_id,
        nullif((metadata->>'expected_monthly_revenue'), '')::numeric::float8 as expected_monthly_revenue,
        nullif((metadata->>'pipeline_value'), '')::numeric::float8 as pipeline_value,
        row_number() over (partition by client_id order by timestamp desc) as rn
      from public.events
      where event_type='proposal_sent'
    ),
    accepted as (
      select distinct client_id from public.events where event_type in ('proposal_accepted','client_activated')
    )
    select lp.client_id::text, lp.expected_monthly_revenue, lp.pipeline_value
    from last_proposal lp
    left join accepted a on a.client_id = lp.client_id
    where lp.rn=1 and a.client_id is null
  `;
  let total = 0;
  for (const r of rows) {
    const emr = Number(r.expected_monthly_revenue ?? 0);
    const pv = Number(r.pipeline_value ?? 0);
    total += emr > 0 ? emr : pv > 0 ? pv / 12 : 0;
  }
  return { open_pipeline_expected_mrr: total };
}

export async function forecastNextMonthRevenue(db: Sql) {
  const rates = await historicalConversionRates(db);
  const pipeline = await openPipelineRevenue(db);

  // Upsell trend: take last 90d accepted upsell MRR, apply a mild momentum factor.
  const upsellRows = await db<Array<{ mrr: number }>>`
    select coalesce(sum(nullif((metadata->>'monthly_revenue'), '')::numeric), 0)::float8 as mrr
    from public.events
    where event_type='upsell_accepted'
      and timestamp >= ${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()}::timestamptz
  `;
  const upsell90d = Number(upsellRows[0]?.mrr ?? 0);
  const upsellMomentum = upsell90d / 3; // rough monthly average

  const projectedPipelineMrr =
    pipeline.open_pipeline_expected_mrr * rates.proposal_to_accept * rates.accept_to_activate;
  const projectedUpsellMrr = upsellMomentum * (1 + Math.min(0.25, rates.upsell_to_accept * 0.1));

  return {
    model: "v1",
    inputs: {
      open_pipeline_expected_mrr: pipeline.open_pipeline_expected_mrr,
      historical_rates_180d: rates,
      upsell_mrr_last_90d: upsell90d,
    },
    projection: {
      next_month_mrr_added: projectedPipelineMrr + projectedUpsellMrr,
      next_month_mrr_added_breakdown: { pipeline: projectedPipelineMrr, upsells: projectedUpsellMrr },
    },
    caveats: [
      "Uses event metadata.expected_monthly_revenue (preferred) or metadata.pipeline_value/12 (fallback).",
      "Historical conversion rates are computed over the last 180 days; adjust if seasonality matters.",
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

export async function exportAnalyticsReport(db: Sql, params: DateRange & { format: "csv" | "pdf" }) {
  const metrics = await calculateBusinessMetrics(db, params);
  const funnel = await analyzeFunnel(db, params);
  const charts = await generateRevenueChartData(db, params);

  if (params.format === "csv") {
    const flat = [{ ...metrics.metrics, start_date: metrics.range.start_date, end_date: metrics.range.end_date }];
    return { ok: true, format: "csv", filename: `analytics-${metrics.range.start_date}-to-${metrics.range.end_date}.csv`, data: toCsv(flat), funnel };
  }

  // Minimal PDF-like text payload (client-side dashboard handles rich PDF rendering).
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
    `Funnel steps:`,
    ...funnel.steps.map((s) => `- ${s.step}: ${s.clients}`),
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

