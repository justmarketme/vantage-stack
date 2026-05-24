import type { Sql } from "postgres";
import { ensureCrmSchema } from "./db";
import { ensureAnalyticsTables } from "../analytics/db";

export const PIPELINE_STAGES = [
  "blueprint-submitted",
  "report-sent",
  "proposal-sent",
  "active-client",
  "upsell-sent",
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

function isPipelineStage(s: string): s is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(s);
}

function reportDerivedStatus(r: {
  sent_at: string | null;
  report_generated: boolean;
  video_complete: boolean;
}): string {
  if (r.video_complete) return "video-complete";
  if (r.sent_at) return "sent";
  if (r.report_generated) return "draft";
  return "draft";
}

export async function listClients(
  db: Sql,
  q: {
    status?: string;
    industry?: string;
    revenue_range?: string;
    date_from?: string;
    date_to?: string;
    search_text?: string;
    sort?: "newest" | "oldest" | "name" | "last_activity";
    page?: number;
    per_page?: number;
  },
) {
  await ensureCrmSchema(db);
  const page = Math.max(1, q.page ?? 1);
  const per = Math.min(100, Math.max(1, q.per_page ?? 20));
  const offset = (page - 1) * per;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let pi = 1;

  if (q.status) {
    conditions.push(`c.status = $${pi++}`);
    params.push(q.status);
  }
  if (q.industry) {
    conditions.push(`c.industry ilike $${pi++}`);
    params.push(`%${q.industry}%`);
  }
  if (q.revenue_range) {
    conditions.push(`c.revenue_range ilike $${pi++}`);
    params.push(`%${q.revenue_range}%`);
  }
  if (q.date_from) {
    conditions.push(`c.created_at >= $${pi++}::timestamptz`);
    params.push(q.date_from);
  }
  if (q.date_to) {
    conditions.push(`c.created_at <= $${pi++}::timestamptz`);
    params.push(q.date_to);
  }
  if (q.search_text?.trim()) {
    const t = `%${q.search_text.trim()}%`;
    conditions.push(`(c.name ilike $${pi} or coalesce(c.company, '') ilike $${pi} or c.email ilike $${pi})`);
    params.push(t);
    pi++;
  }

  const whereSql = conditions.join(" and ");
  const sort =
    q.sort === "oldest"
      ? "c.created_at asc"
      : q.sort === "name"
        ? "c.name asc"
        : q.sort === "last_activity"
          ? "coalesce(c.last_active_at, c.updated_at, c.created_at) desc"
          : "c.created_at desc";

  const countRows = await db.unsafe(
    `select count(*)::int as n from public.clients c where ${whereSql}`,
    params as never[],
  );
  const total = Number((countRows[0] as { n?: number })?.n ?? 0);

  const rows = await db.unsafe(
    `select
        c.id::text as id,
        c.name::text as name,
        coalesce(c.company, c.name)::text as company,
        c.industry::text as industry,
        c.revenue_range::text as revenue_range,
        c.status::text as status,
        c.created_at::text as created_at,
        coalesce(c.last_active_at, c.updated_at, c.created_at)::text as last_activity,
        c.next_action::text as next_action,
        c.assigned_to::text as assigned_to,
        c.email::text as email,
        c.website_url::text as website_url,
        (c.blueprint_markdown is not null) as has_blueprint
      from public.clients c
      where ${whereSql}
      order by ${sort}
      limit ${per} offset ${offset}`,
    params as never[],
  );

  return {
    ok: true as const,
    page,
    per_page: per,
    total,
    total_pages: Math.max(1, Math.ceil(total / per)),
    clients: rows,
  };
}

export async function getClientDetail(db: Sql, id: string) {
  await ensureCrmSchema(db);
  await ensureAnalyticsTables(db);
  const clients = await db`
    select
      c.id::text as id,
      c.name::text as name,
      coalesce(c.company, c.name)::text as company,
      c.email::text as email,
      c.whatsapp::text as whatsapp,
      c.website_url::text as website_url,
      c.industry::text as industry,
      c.revenue_range::text as revenue_range,
      c.status::text as status,
      c.monthly_budget::int as monthly_budget,
      c.next_action::text as next_action,
      c.assigned_to::text as assigned_to,
      c.sop_project_id::text as sop_project_id,
      c.created_at::text as created_at,
      coalesce(c.last_active_at, c.updated_at, c.created_at)::text as last_activity,
      c.challenges as challenges,
      c.competitors as competitors,
      c.tools_used as tools_used,
      c.current_marketing::text as current_marketing,
      c.success_goals::text as success_goals,
      c.created_by::text as created_by,
      c.blueprint_markdown::text as blueprint_markdown,
      c.social_instagram::text as social_instagram,
      c.social_tiktok::text as social_tiktok,
      c.social_facebook::text as social_facebook,
      c.social_x::text as social_x,
      c.social_youtube::text as social_youtube,
      c.social_insights as social_insights
    from public.clients c
    where c.id = ${id}::uuid
    limit 1
  `;
  const client = clients[0] as Record<string, unknown> | undefined;
  if (!client) return { ok: false as const, error: "not_found" };

  const [reports, campaigns, tasks, comms, notes, intel, deals, upsells, journeyEvents] =
    await Promise.all([
      db`
        select
          r.id::text as id,
          r.report_type::text as report_type,
          r.website_score::int as health_score,
          r.video_url::text as video_url,
          r.sent_at::text as sent_at,
          r.created_at::text as created_at,
          r.report_generated,
          r.research_complete,
          r.video_complete
        from public.reports r
        where r.client_id = ${id}::uuid
        order by r.created_at desc
        limit 100
      `,
      db`
        select
          cp.id::text as id,
          cp.platform::text as platform,
          cp.budget::int as budget,
          cp.spend::int as spend,
          cp.leads::int as leads,
          cp.conversions::int as conversions,
          cp.revenue_attributed::int as revenue_attributed,
          cp.status::text as status,
          cp.created_at::text as created_at
        from public.campaigns cp
        where cp.client_id = ${id}::uuid
        order by cp.created_at desc
        limit 50
      `,
      db`
        select
          t.id::text as id,
          t.task_type::text as task_type,
          t.status::text as status,
          t.due_date::text as due_date,
          t.notes::text as description,
          t.assigned_to::text as assigned_to,
          t.priority::text as priority,
          t.created_at::text as created_at
        from public.tasks t
        where t.client_id = ${id}::uuid
        order by t.due_date asc nulls last, t.created_at desc
        limit 100
      `,
      db`
        select id::text, channel::text, subject::text, body_preview::text, sent_at::text, metadata
        from public.client_communications
        where client_id = ${id}::uuid
        order by sent_at desc
        limit 100
      `,
      db`
        select id::text, author::text, body::text, created_at::text
        from public.client_notes
        where client_id = ${id}::uuid
        order by created_at desc
        limit 50
      `,
      db`
        select id::text, title::text, body::text, source::text, severity::text, created_at::text, metadata
        from public.intelligence_items
        where client_id = ${id}::uuid or client_id is null
        order by created_at desc
        limit 30
      `,
      db`
        select
          id::text,
          proposal_status::text,
          deal_value::int,
          service_type::text,
          sent_at::text,
          accepted_at::text,
          expected_close_date::text,
          created_at::text,
          notes::text
        from public.deals
        where client_id = ${id}::uuid
        order by created_at desc
        limit 50
      `,
      db`
        select
          id::text,
          service_name::text,
          projected_revenue::int,
          status::text,
          sent_at::text,
          created_at::text
        from public.upsells
        where client_id = ${id}::uuid
        order by created_at desc
        limit 50
      `,
      db`
        select id::text, event_type::text, timestamp::text, metadata
        from public.events
        where client_id = ${id}::uuid
        order by timestamp desc
        limit 100
      `,
    ]);

  const latest = reports[0] as Record<string, unknown> | undefined;
  const health_score = typeof latest?.health_score === "number" ? latest.health_score : null;
  const latest_summary =
    latest && typeof latest.report_type === "string"
      ? `Latest ${latest.report_type} report (${String(latest.created_at ?? "").slice(0, 10)})`
      : null;

  const reportsOut = (reports as Record<string, unknown>[]).map((r) => ({
    ...r,
    status: reportDerivedStatus({
      sent_at: r.sent_at as string | null,
      report_generated: Boolean(r.report_generated),
      video_complete: Boolean(r.video_complete),
    }),
  }));

  const next_recommended_action =
    (client.next_action as string | null) ||
    (health_score != null && health_score < 50
      ? "Review site fundamentals and schedule a remediation call."
      : "Send personalized follow-up with latest report highlights.");

  return {
    ok: true as const,
    profile: client,
    health_score,
    latest_report_summary: latest_summary,
    next_recommended_action,
    reports: reportsOut,
    campaigns,
    tasks,
    communications: comms,
    notes,
    intelligence_alerts: intel,
    deals,
    upsells,
    journey_events: journeyEvents,
  };
}

export async function getPipeline(db: Sql) {
  await ensureCrmSchema(db);
  const counts = await db`
    select c.status::text as status, count(*)::int as count
    from public.clients c
    group by c.status
  `;
  const byStatus: Record<string, number> = {};
  for (const r of counts as unknown as { status: string; count: number }[]) {
    byStatus[r.status] = r.count;
  }

  const stages: PipelineStage[] = [...PIPELINE_STAGES];
  const stageClients: Record<string, unknown[]> = {};
  const stageResults = await Promise.all(
    stages.map((st) =>
      db`
        select
          c.id::text as id,
          c.name::text as name,
          coalesce(c.company, c.name)::text as company,
          c.industry::text as industry,
          c.revenue_range::text as revenue_range,
          c.monthly_budget::int as monthly_budget,
          c.status::text as status,
          c.created_at::text as date_entered_stage,
          c.next_action::text as next_action,
          c.assigned_to::text as assigned_to
        from public.clients c
        where c.status = ${st}
        order by c.created_at desc
        limit 200
      `
    )
  );
  stages.forEach((st, i) => { stageClients[st] = stageResults[i] as unknown[]; });

  const conversion_rates: { from: string; to: string; rate: number | null }[] = [];
  for (let i = 0; i < stages.length - 1; i++) {
    const a = stages[i];
    const b = stages[i + 1];
    const ca = byStatus[a] ?? 0;
    const cb = byStatus[b] ?? 0;
    const rate = ca > 0 ? Math.min(1, cb / ca) : null;
    conversion_rates.push({ from: a, to: b, rate });
  }

  return {
    ok: true as const,
    stages: stages.map((s) => ({
      id: s,
      count: byStatus[s] ?? 0,
      clients: stageClients[s] ?? [],
    })),
    counts_by_status: byStatus,
    conversion_rates,
  };
}

export async function getCrmRevenueAnalytics(db: Sql) {
  await ensureCrmSchema(db);
  const mrrRows = await db`
    select coalesce(sum(monthly_budget), 0)::int as mrr_cents
    from public.clients
    where status = 'active-client'
  `;
  const mrr = Number((mrrRows[0] as { mrr_cents?: number })?.mrr_cents ?? 0);

  const trend = await db`
    select
      to_char(date_trunc('month', d.accepted_at), 'YYYY-MM') as month,
      coalesce(sum(d.deal_value), 0)::bigint as revenue
    from public.deals d
    where d.accepted_at is not null
      and d.accepted_at >= (now() - interval '12 months')
    group by 1
    order by 1 asc
  `;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

  const newClientRev = await db`
    select coalesce(sum(d.deal_value), 0)::bigint as v
    from public.deals d
    join public.clients c on c.id = d.client_id
    where d.accepted_at is not null
      and d.accepted_at >= ${monthStart}::timestamptz
      and c.created_at >= ${monthStart}::timestamptz
  `;

  const upsellRev = await db`
    select coalesce(sum(projected_revenue), 0)::bigint as v
    from public.upsells
    where status in ('sent', 'accepted', 'won')
      and sent_at is not null
      and sent_at >= ${monthStart}::timestamptz
  `;

  const byService = await db`
    select d.service_type::text as service_type, coalesce(sum(d.deal_value), 0)::bigint as revenue
    from public.deals d
    where d.accepted_at is not null
      and d.accepted_at >= (now() - interval '12 months')
    group by d.service_type
    order by revenue desc
  `;

  return {
    ok: true as const,
    current_mrr_usd: mrr,
    monthly_revenue_trend: trend,
    new_client_revenue_this_month_usd: Number((newClientRev[0] as { v?: string })?.v ?? 0),
    upsell_revenue_this_month_usd: Number((upsellRev[0] as { v?: string })?.v ?? 0),
    breakdown_by_service_type: byService,
  };
}

export async function getCrmFunnelAnalytics(db: Sql) {
  await ensureCrmSchema(db);
  const pipeline = await getPipeline(db);

  const avgBlueprintToReport = await db`
    select
      avg(extract(epoch from (fr.first_sent - c.created_at)) / 86400)::float8 as days
    from public.clients c
    join lateral (
      select min(r.sent_at) as first_sent
      from public.reports r
      where r.client_id = c.id and r.sent_at is not null
    ) fr on fr.first_sent is not null
  `;

  const avgReportToClose = await db`
    select
      avg(extract(epoch from (c.activated_at - fr.first_sent)) / 86400)::float8 as days
    from public.clients c
    join lateral (
      select min(r.sent_at) as first_sent
      from public.reports r
      where r.client_id = c.id and r.sent_at is not null
    ) fr on fr.first_sent is not null
    where c.activated_at is not null
  `;

  const churnRows = await db`
    with month_start as (select date_trunc('month', now()) as ts),
    month_end as (select (date_trunc('month', now()) + interval '1 month') as ts),
    active_start as (
      select count(*)::int as n
      from public.clients c
      cross join month_start ms
      where c.activated_at is not null
        and c.activated_at <= ms.ts
        and (c.churn_date is null or c.churn_date >= ms.ts)
    ),
    churned as (
      select count(*)::int as n
      from public.clients c
      cross join month_start ms
      cross join month_end me
      where c.churn_date >= ms.ts and c.churn_date < me.ts
    )
    select
      churned.n::float / nullif(active_start.n, 0) * 100 as churn_rate_pct,
      active_start.n as active_at_start,
      churned.n as churned_this_month
    from active_start, churned
  `;

  const activationRate = await db`
    select
      count(*) filter (where activated_at is not null)::int as activated,
      count(*)::int as total
    from public.clients
    where status not in ('churned')
  `;

  return {
    ok: true as const,
    pipeline,
    avg_days_blueprint_to_first_sent: (avgBlueprintToReport[0] as { days?: number })?.days ?? null,
    avg_days_first_sent_to_activation: (avgReportToClose[0] as { days?: number })?.days ?? null,
    churn: churnRows[0],
    activation: activationRate[0],
    stage_avg_days: PIPELINE_STAGES.map((s) => ({
      stage: s,
      avg_days_in_stage: null as number | null,
      note: "Stage entry timestamps not tracked; extend schema with client_stage_history for precise dwell time.",
    })),
  };
}

export async function listReports(
  db: Sql,
  q: {
    date_from?: string;
    date_to?: string;
    client_id?: string;
    report_type?: string;
    status?: string;
    sort?: "newest" | "oldest" | "health_score";
    page?: number;
    per_page?: number;
  },
) {
  await ensureCrmSchema(db);
  const page = Math.max(1, q.page ?? 1);
  const per = Math.min(100, Math.max(1, q.per_page ?? 20));
  const offset = (page - 1) * per;

  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let pi = 1;
  if (q.client_id) {
    conditions.push(`x.client_id = $${pi++}::uuid`);
    params.push(q.client_id);
  }
  if (q.report_type) {
    conditions.push(`x.report_type = $${pi++}`);
    params.push(q.report_type);
  }
  if (q.date_from) {
    conditions.push(`x.report_date >= $${pi++}::timestamptz`);
    params.push(q.date_from);
  }
  if (q.date_to) {
    conditions.push(`x.report_date <= $${pi++}::timestamptz`);
    params.push(q.date_to);
  }
  if (q.status) {
    conditions.push(`x.derived_status = $${pi++}`);
    params.push(q.status);
  }
  const whereSql = conditions.join(" and ");
  const sort =
    q.sort === "oldest"
      ? "x.report_date asc"
      : q.sort === "health_score"
        ? "x.health_score desc nulls last"
        : "x.report_date desc";

  const countRows = await db.unsafe(
    `select count(*)::int as n from (
      select r.id,
        case
          when r.video_complete then 'video-complete'
          when r.sent_at is not null then 'sent'
          when r.report_generated then 'draft'
          else 'draft'
        end as derived_status,
        r.created_at as report_date,
        r.report_type,
        r.client_id
      from public.reports r
    ) x
    where ${whereSql}`,
    params as never[],
  );
  const total = Number((countRows[0] as { n?: number })?.n ?? 0);

  const rows = await db.unsafe(
    `select
        x.id::text as id,
        x.client_name::text as client_name,
        x.client_id::text as client_id,
        x.report_type::text as report_type,
        x.health_score::int as health_score,
        x.video_url::text as video_url,
        x.sent_at::text as sent_at,
        x.report_date::text as report_date,
        x.report_generated,
        x.video_complete,
        x.derived_status::text as status
      from (
        select
          r.id,
          coalesce(c.name, '') as client_name,
          c.id as client_id,
          r.report_type,
          r.website_score as health_score,
          r.video_url,
          r.sent_at,
          r.created_at as report_date,
          r.report_generated,
          r.video_complete,
          case
            when r.video_complete then 'video-complete'
            when r.sent_at is not null then 'sent'
            when r.report_generated then 'draft'
            else 'draft'
          end as derived_status
        from public.reports r
        join public.clients c on c.id = r.client_id
      ) x
      where ${whereSql}
      order by ${sort}
      limit ${per} offset ${offset}`,
    params as never[],
  );

  return {
    ok: true as const,
    page,
    per_page: per,
    total,
    total_pages: Math.max(1, Math.ceil(total / per)),
    reports: rows as Record<string, unknown>[],
  };
}

export async function listCampaigns(db: Sql) {
  await ensureCrmSchema(db);
  const rows = await db`
    select
      cp.id::text as campaign_id,
      cp.platform::text as platform,
      cp.budget::int as budget,
      cp.spend::int as spend,
      cp.leads::int as leads,
      cp.conversions::int as conversions,
      cp.revenue_attributed::int as revenue_attributed,
      cp.status::text as status,
      c.name::text as client_name,
      c.id::text as client_id
    from public.campaigns cp
    join public.clients c on c.id = cp.client_id
    where coalesce(cp.status, '') not in ('archived', 'cancelled')
    order by cp.created_at desc
    limit 200
  `;

  const out = (rows as Record<string, unknown>[]).map((r) => {
    const spend = Number(r.spend ?? 0);
    const rev = Number(r.revenue_attributed ?? 0);
    const roi = spend > 0 ? (rev - spend) / spend : null;
    return {
      campaign_name: `${r.client_name} — ${r.platform}`,
      client_name: r.client_name,
      platform: r.platform,
      budget: r.budget,
      spend_to_date: r.spend,
      leads: r.leads,
      conversions: r.conversions,
      roi,
      revenue_attributed: r.revenue_attributed,
      status: r.status,
      campaign_id: r.campaign_id,
      client_id: r.client_id,
    };
  });
  return { ok: true as const, campaigns: out };
}

export async function listTasks(
  db: Sql,
  q: {
    assigned_to?: string;
    status?: string;
    priority?: string;
    due_from?: string;
    due_to?: string;
  },
) {
  await ensureCrmSchema(db);
  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let pi = 1;
  if (q.assigned_to) {
    conditions.push(`t.assigned_to ilike $${pi++}`);
    params.push(`%${q.assigned_to}%`);
  }
  if (q.status) {
    conditions.push(`coalesce(t.status, '') = $${pi++}`);
    params.push(q.status);
  }
  if (q.priority) {
    conditions.push(`coalesce(t.priority, '') = $${pi++}`);
    params.push(q.priority);
  }
  if (q.due_from) {
    conditions.push(`t.due_date >= $${pi++}::date`);
    params.push(q.due_from);
  }
  if (q.due_to) {
    conditions.push(`t.due_date <= $${pi++}::date`);
    params.push(q.due_to);
  }
  const whereSql = conditions.join(" and ");

  const rows = await db.unsafe(
    `select
        t.id::text as id,
        t.notes::text as task_description,
        c.name::text as client_name,
        c.id::text as client_id,
        t.due_date::text as due_date,
        t.assigned_to::text as assigned_to,
        t.priority::text as priority,
        t.status::text as status,
        t.task_type::text as task_type,
        t.created_at::text as created_at
      from public.tasks t
      join public.clients c on c.id = t.client_id
      where ${whereSql}
      order by t.due_date asc nulls last, t.created_at desc
      limit 500`,
    params as never[],
  );
  return { ok: true as const, tasks: rows };
}

export async function listActivity(
  db: Sql,
  q: { date_from?: string; date_to?: string; user?: string; action_type?: string; limit?: number },
) {
  await ensureCrmSchema(db);
  const lim = Math.min(500, Math.max(1, q.limit ?? 100));
  const conditions: string[] = ["1=1"];
  const params: unknown[] = [];
  let pi = 1;
  if (q.date_from) {
    conditions.push(`a.created_at >= $${pi++}::timestamptz`);
    params.push(q.date_from);
  }
  if (q.date_to) {
    conditions.push(`a.created_at <= $${pi++}::timestamptz`);
    params.push(q.date_to);
  }
  if (q.user) {
    conditions.push(`a.user_actor ilike $${pi++}`);
    params.push(`%${q.user}%`);
  }
  if (q.action_type) {
    conditions.push(`a.action_type = $${pi++}`);
    params.push(q.action_type);
  }
  const whereSql = conditions.join(" and ");

  const rows = await db.unsafe(
    `select
        a.action_type::text as action_type,
        coalesce(c.name, '')::text as client_name,
        a.created_at::text as timestamp,
        a.user_actor::text as user_who_performed_action,
        a.details,
        a.id::text as id
      from public.crm_activity a
      left join public.clients c on c.id = a.client_id
      where ${whereSql}
      order by a.created_at desc
      limit ${lim}`,
    params as never[],
  );

  const tgConditions: string[] = ["1=1"];
  const tgParams: unknown[] = [];
  let tgi = 1;
  if (q.date_from) {
    tgConditions.push(`t.created_at >= $${tgi++}::timestamptz`);
    tgParams.push(q.date_from);
  }
  if (q.date_to) {
    tgConditions.push(`t.created_at <= $${tgi++}::timestamptz`);
    tgParams.push(q.date_to);
  }
  if (q.user) {
    tgConditions.push(`coalesce(t.username, '') ilike $${tgi++}`);
    tgParams.push(`%${q.user}%`);
  }
  if (q.action_type?.startsWith("telegram")) {
    const cmd = q.action_type.replace(/^telegram_/, "");
    tgConditions.push(`t.command = $${tgi++}`);
    tgParams.push(cmd);
  }
  const tgWhere = tgConditions.join(" and ");

  const telegram = await db.unsafe(
    `select
        ('telegram_' || t.command)::text as action_type,
        ''::text as client_name,
        t.created_at::text as timestamp,
        coalesce(t.username, '')::text as user_who_performed_action,
        jsonb_build_object('args', t.args, 'chat_id', t.chat_id, 'ok', t.ok) as details,
        t.id::text as id
      from public.telegram_command_log t
      where ${tgWhere}
      order by t.created_at desc
      limit ${lim}`,
    tgParams as never[],
  ).catch(() => []);

  const includeTelegram = !q.action_type || q.action_type.startsWith("telegram");
  const merged = [...(rows as unknown[]), ...(includeTelegram ? (telegram as unknown[]) : [])]
    .sort((x: any, y: any) => String(y.timestamp).localeCompare(String(x.timestamp)))
    .slice(0, lim);

  return { ok: true as const, activity: merged };
}

export async function updateClientStatus(db: Sql, clientId: string, new_status: string, actor?: string) {
  await ensureCrmSchema(db);
  if (!isPipelineStage(new_status) && new_status !== "churned") {
    return { ok: false as const, error: "invalid_status" };
  }
  const prev = await db`select status::text as status from public.clients where id = ${clientId}::uuid limit 1`;
  const oldStatus = (prev[0] as { status?: string } | undefined)?.status;

  await db`
    update public.clients
    set status = ${new_status}, updated_at = now()
    where id = ${clientId}::uuid
  `;

  await db`
    insert into public.crm_activity (action_type, client_id, user_actor, details)
    values (
      'client_status_changed',
      ${clientId}::uuid,
      ${actor ?? "crm_user"},
      ${JSON.stringify({ from: oldStatus, to: new_status })}::jsonb
    )
  `;

  return { ok: true as const, client_id: clientId, status: new_status };
}

export async function createTask(
  db: Sql,
  input: {
    client_id: string;
    description: string;
    due_date?: string | null;
    assigned_to?: string | null;
    priority?: string | null;
  },
) {
  await ensureCrmSchema(db);
  const rows = await db`
    insert into public.tasks (client_id, task_type, status, due_date, notes, assigned_to, priority)
    values (
      ${input.client_id}::uuid,
      'follow-up',
      'open',
      ${input.due_date ? input.due_date : null}::date,
      ${input.description},
      ${input.assigned_to ?? null},
      ${input.priority ?? "normal"}
    )
    returning id::text as id
  `;
  const id = (rows[0] as { id?: string })?.id;
  await db`
    insert into public.crm_activity (action_type, client_id, user_actor, details)
    values (
      'task_created',
      ${input.client_id}::uuid,
      ${input.assigned_to ?? "crm_user"},
      ${JSON.stringify({ task_id: id, description: input.description })}::jsonb
    )
  `;
  return { ok: true as const, task_id: id };
}

export async function addClientNote(db: Sql, clientId: string, note_text: string, author?: string) {
  await ensureCrmSchema(db);
  const rows = await db`
    insert into public.client_notes (client_id, body, author)
    values (${clientId}::uuid, ${note_text}, ${author ?? "team"})
    returning id::text as id, created_at::text as created_at
  `;
  await db`
    insert into public.crm_activity (action_type, client_id, user_actor, details)
    values (
      'note_added',
      ${clientId}::uuid,
      ${author ?? "team"},
      ${JSON.stringify({ note_id: (rows[0] as { id?: string })?.id })}::jsonb
    )
  `;
  return { ok: true as const, note: rows[0] };
}

export async function syncReportDelivered(
  db: Sql,
  input: {
    report_id: string;
    client_id: string;
    move_to_report_sent?: boolean;
    user_actor?: string;
    extra_details?: Record<string, unknown>;
  },
) {
  await ensureCrmSchema(db);
  const sentAt = new Date().toISOString();
  await db`
    update public.reports
    set sent_at = ${sentAt}::timestamptz,
        delivery_complete = true
    where id = ${input.report_id}::uuid and client_id = ${input.client_id}::uuid
  `;
  await db`
    update public.clients
    set last_active_at = now(), updated_at = now()
    where id = ${input.client_id}::uuid
  `;
  if (input.move_to_report_sent !== false) {
    await db`
      update public.clients
      set status = 'report-sent', updated_at = now()
      where id = ${input.client_id}::uuid and status = 'blueprint-submitted'
    `;
  }
  const details = { report_id: input.report_id, sent_at: sentAt, ...(input.extra_details ?? {}) };
  await db`
    insert into public.crm_activity (action_type, client_id, user_actor, details)
    values (
      'report_sent',
      ${input.client_id}::uuid,
      ${input.user_actor ?? "delivery"},
      ${JSON.stringify(details)}::jsonb
    )
  `;
  return { ok: true as const, sent_at: sentAt };
}

export async function appendIntelligence(db: Sql, input: { client_id?: string | null; title: string; body?: string; source?: string; severity?: string }) {
  await ensureCrmSchema(db);
  await db`
    insert into public.intelligence_items (client_id, title, body, source, severity)
    values (
      ${input.client_id ? input.client_id : null}::uuid,
      ${input.title},
      ${input.body ?? null},
      ${input.source ?? "morning-briefing"},
      ${input.severity ?? "info"}
    )
  `;
  return { ok: true as const };
}
