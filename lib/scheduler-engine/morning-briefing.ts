import postgres from "postgres";

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function isoNow() {
  return new Date().toISOString();
}

async function ensureBriefingsTable(db: any) {
  await db.unsafe(`
    create table if not exists briefings (
      id text primary key,
      briefing_date date not null,
      created_at timestamptz not null,
      sent_at timestamptz,
      client_count_scanned int not null,
      alerts_found int not null,
      competitor_moves_found int not null,
      opportunities_found int not null,
      briefing_json jsonb,
      briefing_text text
    );
    create index if not exists briefings_date_idx on briefings (briefing_date);
  `);
}

export type MorningBriefingOutput = {
  briefing_json: any;
  message: string;
  meta: {
    clients_scanned: number;
    alerts_found: number;
    competitor_moves_found: number;
    opportunities_found: number;
    generated_at: string;
  };
};

function formatBriefingMessage(data: any): string {
  // Keep this readable + stable (telegram-friendly).
  const date = new Date().toISOString().slice(0, 10);
  const meta = data?.briefing_json?.meta ?? {};
  const focus = Array.isArray(data?.briefing_json?.focus_clients) ? data.briefing_json.focus_clients : [];

  const lines: string[] = [];
  lines.push(`Morning Briefing — ${date}`);
  lines.push("");
  lines.push(
    `Snapshot: ${meta.alerts_found ?? 0} alerts • ${meta.competitor_moves_found ?? 0} competitor moves • ${meta.opportunities_found ?? 0} opps • ${meta.scanned_client_count ?? 0} clients scanned`,
  );
  lines.push("");

  if (focus.length) {
    lines.push("Clients to Focus");
    lines.push(`- ${focus.slice(0, 8).join(", ")}`);
    lines.push("");
  }

  const alerts = Array.isArray(data?.briefing_json?.critical_alerts) ? data.briefing_json.critical_alerts : [];
  if (alerts.length) {
    lines.push(`Critical Alerts (${alerts.length})`);
    for (const a of alerts.slice(0, 6)) lines.push(`- ${String(a?.message ?? "").trim()}`.trim());
    if (alerts.length > 6) lines.push(`- …and ${alerts.length - 6} more`);
    lines.push("");
  }

  const news = Array.isArray(data?.briefing_json?.industry_news) ? data.briefing_json.industry_news : [];
  if (news.length) {
    lines.push("Industry News (Top)");
    for (const n of news.slice(0, 5)) lines.push(`- ${String(n?.headline ?? "News")}${n?.url ? ` (${n.url})` : ""}`);
    lines.push("");
  }

  const opps = Array.isArray(data?.briefing_json?.opportunities) ? data.briefing_json.opportunities : [];
  if (opps.length) {
    lines.push("Top Opportunities (Today)");
    for (const o of opps.slice(0, 3)) lines.push(`- ${String(o?.client_name ?? "Client")}: ${String(o?.title ?? "Opportunity")}`);
    lines.push("");
  }

  const leads = Array.isArray(data?.new_leads) ? data.new_leads : [];
  lines.push(`New Leads (${leads.length})`);
  lines.push(leads.length ? `- ${leads.map((l: any) => String(l?.name ?? "Unknown")).slice(0, 25).join(", ")}` : "- None");
  lines.push("");

  const errors = Array.isArray(data?.system_health?.api_errors) ? data.system_health.api_errors : [];
  const errCount = errors.reduce((acc: number, e: any) => acc + (typeof e?.count === "number" ? e.count : 1), 0);
  lines.push("System Health");
  lines.push(errCount ? `- Errors: ${errCount}` : "- All clear");

  return lines.join("\n").trim();
}

async function queryOvernightDataCompat(): Promise<any> {
  // We intentionally re-use the same SQL-driven approach as the MCP server uses:
  // all customization lives in env vars.
  const timezone = env("BRIEFING_TIMEZONE") || "UTC";
  const pgUrl = env("BRIEFING_PG_URL");
  if (!pgUrl) throw new Error("BRIEFING_PG_URL is required for morning briefing cron.");

  // Importing from mcp/briefing-generator isn't possible in current structure,
  // so we do a light-weight call by re-implementing the query subset here.
  // (This keeps the cron route stable even if MCP wiring changes.)
  const db = postgres(pgUrl, { max: 5, prepare: false });
  try {
    const until = new Date();
    const since = new Date(until.getTime() - 12 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();

    const sql = {
      new_leads:
        env("BRIEFING_SQL_NEW_LEADS") ||
        `select id::text as id, name::text as name, created_at::text as created_at
from blueprint_submissions
where created_at >= $1 and created_at < $2
order by created_at desc
limit 50`,
      at_risk_clients:
        env("BRIEFING_SQL_AT_RISK_CLIENTS") ||
        `select client_id::text as id, client_name::text as name, metric_name::text as metric_name,
       yesterday_value::float8 as yesterday_value, today_value::float8 as today_value,
       (today_value - yesterday_value)::float8 as delta
from client_metric_deltas
where date = (current_date at time zone $3)
  and (today_value - yesterday_value) < 0
order by (today_value - yesterday_value) asc
limit 25`,
      upsell_opportunities:
        env("BRIEFING_SQL_UPSELL_OPPORTUNITIES") ||
        `select id::text as id, client_name::text as client_name, offer::text as offer,
       projected_revenue::float8 as projected_revenue, confidence::float8 as confidence, notes::text as notes
from upsell_opportunities
where status = 'ready'
order by projected_revenue desc nulls last
limit 25`,
      tasks_due_today:
        env("BRIEFING_SQL_TASKS_DUE_TODAY") ||
        `select id::text as id, title::text as title, owner::text as owner,
       due_date::text as due_date, priority::text as priority
from tasks
where due_date = (current_date at time zone $3)
  and (status is null or status not in ('done','completed'))
order by priority desc nulls last, id desc
limit 50`,
      system_errors:
        env("BRIEFING_SQL_SYSTEM_ERRORS") ||
        `select service::text as service, message::text as message, count(*)::int as count
from system_errors
where created_at >= $1 and created_at < $2
group by service, message
order by count(*) desc
limit 25`,
      active_clients:
        env("BRIEFING_SQL_ACTIVE_CLIENTS") ||
        `select id::text as id, name::text as name, industry::text as industry, competitors::text as competitors
from clients
where (status is null or status = 'active')
order by name asc
limit 200`,
      client_weekly_metrics:
        env("BRIEFING_SQL_CLIENT_WEEKLY_METRICS") ||
        `select client_id::text as client_id,
       traffic::float8 as traffic,
       conversions::float8 as conversions,
       cost_per_lead::float8 as cost_per_lead,
       avg_7d_traffic::float8 as avg_7d_traffic,
       avg_7d_conversions::float8 as avg_7d_conversions,
       avg_7d_cpl::float8 as avg_7d_cpl
from client_weekly_metrics
where week_ending >= (current_date - interval '7 days')
order by week_ending desc`,
    };

    const results = await Promise.allSettled([
      db.unsafe(sql.new_leads, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.at_risk_clients, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.upsell_opportunities, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.tasks_due_today, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.system_errors, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.active_clients, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.client_weekly_metrics, [sinceIso, untilIso, timezone]),
    ]);

    const [newLeadsR, atRiskR, upsellsR, tasksR, systemErrorsR, activeClientsR, clientMetricsR] = results;
    const new_leads = newLeadsR.status === "fulfilled" ? newLeadsR.value : [];
    const at_risk_clients = atRiskR.status === "fulfilled" ? atRiskR.value : [];
    const upsell_opportunities = upsellsR.status === "fulfilled" ? upsellsR.value : [];
    const tasks_due_today = tasksR.status === "fulfilled" ? tasksR.value : [];
    const api_errors = systemErrorsR.status === "fulfilled" ? systemErrorsR.value : [];
    const client_profiles = activeClientsR.status === "fulfilled" ? activeClientsR.value : [];
    const client_metrics = clientMetricsR.status === "fulfilled" ? clientMetricsR.value : [];

    // Minimal "briefing_json" rollup (the MCP has richer logic; this is stable + adequate).
    const briefing_json = {
      critical_alerts: [],
      competitor_moves: [],
      industry_news: [],
      opportunities: (upsell_opportunities ?? []).slice(0, 10).map((u: any) => ({
        client_name: String(u?.client_name ?? "Unknown"),
        title: u?.offer ? `Upsell: ${String(u.offer)}` : "Upsell: ready to push",
        projected_revenue: u?.projected_revenue ?? undefined,
      })),
      focus_clients: [],
      meta: {
        alerts_found: 0,
        competitor_moves_found: 0,
        opportunities_found: Array.isArray(upsell_opportunities) ? Math.min(10, upsell_opportunities.length) : 0,
        scanned_client_count: Array.isArray(client_profiles) ? client_profiles.length : 0,
      },
    };

    return {
      generated_at: isoNow(),
      window: { since_iso: sinceIso, until_iso: untilIso, timezone },
      new_leads: (new_leads ?? []).map((r: any) => ({ id: r.id ?? undefined, name: String(r.name ?? "Unknown"), created_at: r.created_at ?? undefined })),
      at_risk_clients: (at_risk_clients ?? []).map((r: any) => ({
        id: r.id ?? undefined,
        name: String(r.name ?? "Unknown"),
        metric_name: r.metric_name ?? undefined,
        yesterday_value: r.yesterday_value ?? undefined,
        today_value: r.today_value ?? undefined,
        delta: r.delta ?? undefined,
      })),
      upsell_opportunities: (upsell_opportunities ?? []).map((r: any) => ({
        id: r.id ?? undefined,
        client_name: String(r.client_name ?? "Unknown"),
        offer: r.offer ?? undefined,
        projected_revenue: r.projected_revenue ?? undefined,
        confidence: r.confidence ?? undefined,
        notes: r.notes ?? undefined,
      })),
      tasks_due_today: (tasks_due_today ?? []).map((r: any) => ({
        id: r.id ?? undefined,
        title: String(r.title ?? "Untitled"),
        owner: r.owner ?? undefined,
        due_date: r.due_date ?? undefined,
        priority: r.priority ?? undefined,
      })),
      system_health: { api_errors: (api_errors ?? []).map((r: any) => ({ service: r.service ?? undefined, message: String(r.message ?? "Unknown error"), count: r.count ?? undefined })), failed_automations: [] },
      clients_scanned: Array.isArray(client_profiles) ? client_profiles.length : 0,
      client_profiles,
      client_metrics,
      briefing_json,
    };
  } finally {
    await db.end({ timeout: 5 });
  }
}

export async function runMorningBriefing(): Promise<MorningBriefingOutput> {
  const data = await queryOvernightDataCompat();
  const message = formatBriefingMessage(data);

  const meta = {
    clients_scanned: Number(data?.briefing_json?.meta?.scanned_client_count ?? 0),
    alerts_found: Number(data?.briefing_json?.meta?.alerts_found ?? 0),
    competitor_moves_found: Number(data?.briefing_json?.meta?.competitor_moves_found ?? 0),
    opportunities_found: Number(data?.briefing_json?.meta?.opportunities_found ?? 0),
    generated_at: isoNow(),
  };

  // Best-effort DB persistence (matches scripts/mcp behavior).
  const pgUrl = env("BRIEFING_PG_URL");
  if (pgUrl) {
    const db = postgres(pgUrl, { max: 5, prepare: false });
    try {
      await ensureBriefingsTable(db);
      const id = `brief_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const date = new Date().toISOString().slice(0, 10);
      await db`
        insert into briefings (
          id, briefing_date, created_at, sent_at,
          client_count_scanned, alerts_found, competitor_moves_found, opportunities_found,
          briefing_json, briefing_text
        ) values (
          ${id},
          ${date},
          ${new Date().toISOString()},
          ${new Date().toISOString()},
          ${meta.clients_scanned},
          ${meta.alerts_found},
          ${meta.competitor_moves_found},
          ${meta.opportunities_found},
          ${(data?.briefing_json ?? null) as any},
          ${message}
        )
      `;
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  return { briefing_json: data?.briefing_json ?? null, message, meta };
}

