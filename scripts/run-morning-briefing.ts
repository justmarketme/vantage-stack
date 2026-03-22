#!/usr/bin/env npx tsx
/**
 * One-shot daily run:
 * - query at 07:00 local (or immediately if after 07:00)
 * - send at 07:15 local
 *
 * Schedule this script externally (cron/Task Scheduler) to run daily at ~06:59–07:00.
 */

import { setTimeout as sleep } from "timers/promises";
import postgres from "postgres";

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function nextUtcTimeToday(hh: number, mm: number) {
  const now = new Date();
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hh, mm, 0, 0));
  return t;
}

function msUntil(d: Date) {
  return Math.max(0, d.getTime() - Date.now());
}

function fmtMoney(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function parseCompetitors(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean).slice(0, 3);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean).slice(0, 3);
    } catch {
      // ignore
    }
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  if (v && typeof v === "object") {
    const obj = v as any;
    if (Array.isArray(obj.competitors)) return obj.competitors.map((x: any) => String(x)).filter(Boolean).slice(0, 3);
  }
  return [];
}

async function fetchNewsEverything(params: {
  apiKey: string;
  q: string;
  fromIso: string;
  toIso: string;
  language?: string;
  pageSize?: number;
}): Promise<any[]> {
  const endpoint = env("BRIEFING_NEWS_API_ENDPOINT") || "https://newsapi.org/v2/everything";
  const url = new URL(endpoint);
  url.searchParams.set("q", params.q);
  url.searchParams.set("from", params.fromIso);
  url.searchParams.set("to", params.toIso);
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", String(params.pageSize ?? 10));
  url.searchParams.set("language", (params.language ?? "en").trim() || "en");
  const res = await fetch(url.toString(), { headers: { "X-Api-Key": params.apiKey } });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`News API failed: ${res.status} ${JSON.stringify(json)}`);
  return Array.isArray(json?.articles) ? json.articles : [];
}

function trafficDropAlert(traffic: number | undefined, avg7: number | undefined) {
  if (typeof traffic !== "number" || typeof avg7 !== "number" || !Number.isFinite(traffic) || !Number.isFinite(avg7) || avg7 <= 0) return null;
  const change = (traffic - avg7) / avg7;
  if (change <= -0.1) {
    return {
      severity: change <= -0.25 ? ("critical" as const) : ("high" as const),
      pct: Math.round(Math.abs(change) * 1000) / 10,
    };
  }
  return null;
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

async function runCompetitiveScan() {
  const pgUrl = env("BRIEFING_PG_URL");
  if (!pgUrl) throw new Error("BRIEFING_PG_URL is required in .env.local");

  const timezone = env("BRIEFING_TIMEZONE") || "UTC";
  const until = new Date();
  const since = new Date(until.getTime() - 12 * 60 * 60 * 1000);

  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const sql = {
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
  };

  const db = postgres(pgUrl, { max: 5, prepare: false });
  try {
    const results = await Promise.allSettled([
      db.unsafe(sql.active_clients, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.client_weekly_metrics, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.new_leads, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.at_risk_clients, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.upsell_opportunities, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.tasks_due_today, [sinceIso, untilIso, timezone]),
      db.unsafe(sql.system_errors, [sinceIso, untilIso, timezone]),
    ]);

    const [clientsR, metricsR, newLeadsR, atRiskR, upsellsR, tasksR, errorsR] = results;
    const clients = clientsR.status === "fulfilled" ? clientsR.value : [];
    const metrics = metricsR.status === "fulfilled" ? metricsR.value : [];
    const newLeads = newLeadsR.status === "fulfilled" ? newLeadsR.value : [];
    const atRisk = atRiskR.status === "fulfilled" ? atRiskR.value : [];
    const upsells = upsellsR.status === "fulfilled" ? upsellsR.value : [];
    const tasks = tasksR.status === "fulfilled" ? tasksR.value : [];
    const systemErrors = errorsR.status === "fulfilled" ? errorsR.value : [];

    const failed = results
      .map((r, i) => (r.status === "rejected" ? { idx: i, reason: String((r as any).reason?.message ?? (r as any).reason ?? "failed") } : null))
      .filter(Boolean) as Array<{ idx: number; reason: string }>;

    const clientProfiles = (clients ?? [])
      .map((r: any) => ({
        id: String(r.id ?? r.client_id ?? ""),
        name: String(r.name ?? r.client_name ?? "Unknown"),
        industry: r.industry ? String(r.industry) : undefined,
        competitors: parseCompetitors(r.competitors ?? r.top_competitors ?? r.competitor_names),
      }))
      .filter((c) => c.id);

    const metricsByClient = new Map(
      (metrics ?? [])
        .map((r: any) => ({
          client_id: String(r.client_id ?? r.id ?? ""),
          traffic: typeof r.traffic === "number" ? r.traffic : undefined,
          conversions: typeof r.conversions === "number" ? r.conversions : undefined,
          cost_per_lead: typeof (r.cost_per_lead ?? r.cpl) === "number" ? (r.cost_per_lead ?? r.cpl) : undefined,
          avg_7d_traffic: typeof r.avg_7d_traffic === "number" ? r.avg_7d_traffic : undefined,
          avg_7d_conversions: typeof r.avg_7d_conversions === "number" ? r.avg_7d_conversions : undefined,
          avg_7d_cpl: typeof r.avg_7d_cpl === "number" ? r.avg_7d_cpl : undefined,
        }))
        .filter((m: any) => m.client_id)
        .map((m: any) => [m.client_id, m] as const),
    );

    const criticalAlerts: any[] = [];
    for (const c of clientProfiles) {
      const m = metricsByClient.get(c.id);
      const alert = trafficDropAlert(m?.traffic, m?.avg_7d_traffic);
      if (alert) {
        criticalAlerts.push({
          client_id: c.id,
          client_name: c.name,
          type: "traffic_drop_vs_7d_avg",
          severity: alert.severity,
          message: `${c.name}: Traffic down ${alert.pct}% vs 7‑day avg.`,
        });
      }
    }

    const newsKey = env("BRIEFING_NEWS_API_KEY");
    const from24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const toNow = new Date().toISOString();

    const competitorMoves: any[] = [];
    const industryNews: any[] = [];

    if (newsKey) {
      const maxClients = Math.min(30, clientProfiles.length);
      for (const c of clientProfiles.slice(0, maxClients)) {
        const terms = [c.industry, ...c.competitors].filter(Boolean).slice(0, 4) as string[];
        if (!terms.length) continue;
        const q = terms.map((t) => `"${t}"`).join(" OR ");
        try {
          const articles = await fetchNewsEverything({ apiKey: newsKey, q, fromIso: from24, toIso: toNow, pageSize: 6 });
          for (const a of articles) {
            const title = String(a?.title ?? "Untitled");
            const url = typeof a?.url === "string" ? a.url : undefined;
            const published_at = typeof a?.publishedAt === "string" ? a.publishedAt : undefined;
            const desc = typeof a?.description === "string" ? a.description : undefined;
            const hay = `${title} ${desc ?? ""}`.toLowerCase();
            const matchedCompetitor = c.competitors.find((comp) => hay.includes(comp.toLowerCase()));
            if (matchedCompetitor) {
              competitorMoves.push({
                client_id: c.id,
                client_name: c.name,
                competitor: matchedCompetitor,
                headline: title,
                url,
                published_at,
                why_it_matters: `Competitive signal for ${c.name}.`,
              });
            } else {
              industryNews.push({ client_id: c.id, client_name: c.name, headline: title, url, published_at, summary: desc });
            }
          }
        } catch {
          // Best-effort: ignore per-client news failures
        }
      }

      try {
        const updates = await fetchNewsEverything({
          apiKey: newsKey,
          q: `("Google algorithm update" OR "Google Search update" OR "Meta Ads update" OR "TikTok Ads update" OR "LinkedIn Ads update")`,
          fromIso: from24,
          toIso: toNow,
          pageSize: 6,
        });
        for (const a of updates) {
          const title = String(a?.title ?? "Untitled");
          const url = typeof a?.url === "string" ? a.url : undefined;
          const published_at = typeof a?.publishedAt === "string" ? a.publishedAt : undefined;
          const desc = typeof a?.description === "string" ? a.description : undefined;
          industryNews.unshift({ headline: title, url, published_at, summary: desc });
        }
      } catch {
        // ignore
      }
    }

    const opportunities: any[] = [];
    const upsellTop = (upsells ?? [])
      .map((r: any) => ({
        client_name: String(r.client_name ?? "Unknown"),
        offer: r.offer ? String(r.offer) : undefined,
        projected_revenue: typeof r.projected_revenue === "number" ? r.projected_revenue : undefined,
        notes: r.notes ? String(r.notes) : undefined,
      }))
      .sort((a, b) => (b.projected_revenue ?? 0) - (a.projected_revenue ?? 0));
    for (const u of upsellTop.slice(0, 10)) {
      opportunities.push({
        client_name: u.client_name,
        title: u.offer ? `Upsell: ${u.offer}` : "Upsell: ready to push",
        rationale: u.notes,
        projected_revenue: u.projected_revenue,
      });
    }
    for (const m of competitorMoves.slice(0, 10)) {
      opportunities.push({
        client_id: m.client_id,
        client_name: m.client_name,
        title: `Counter-move for ${m.competitor ?? "competitor"}`,
        rationale: `Competitor activity detected: ${m.headline}`,
      });
    }

    const focus = new Set<string>();
    for (const a of criticalAlerts) if (a.client_name) focus.add(a.client_name);
    for (const u of upsellTop.slice(0, 5)) focus.add(u.client_name);

    const briefing_json = {
      critical_alerts: criticalAlerts,
      competitor_moves: competitorMoves,
      industry_news: industryNews,
      opportunities,
      focus_clients: Array.from(focus).slice(0, 10),
      meta: {
        alerts_found: criticalAlerts.length,
        competitor_moves_found: competitorMoves.length,
        opportunities_found: opportunities.length,
        scanned_client_count: clientProfiles.length,
      },
    };

    return {
      window: { since_iso: sinceIso, until_iso: untilIso, timezone },
      client_profiles: clientProfiles,
      client_metrics: Array.from(metricsByClient.values()),
      briefing_json,
      new_leads: (newLeads ?? []).map((r: any) => ({ name: String(r.name ?? "Unknown") })),
      at_risk_clients: (atRisk ?? []).map((r: any) => ({
        name: String(r.name ?? "Unknown"),
        metric_name: r.metric_name ?? undefined,
        delta: typeof r.delta === "number" ? r.delta : undefined,
        yesterday_value: typeof r.yesterday_value === "number" ? r.yesterday_value : undefined,
      })),
      upsell_opportunities: (upsells ?? []).map((r: any) => ({
        client_name: String(r.client_name ?? "Unknown"),
        offer: r.offer ?? undefined,
        projected_revenue: typeof r.projected_revenue === "number" ? r.projected_revenue : undefined,
      })),
      tasks_due_today: (tasks ?? []).map((r: any) => ({
        title: String(r.title ?? "Untitled"),
        owner: r.owner ?? undefined,
        priority: r.priority ?? undefined,
      })),
      system_errors: (systemErrors ?? []).map((r: any) => ({
        service: r.service ?? undefined,
        message: String(r.message ?? "Unknown error"),
        count: typeof r.count === "number" ? r.count : undefined,
      })),
      failed_queries: failed,
    };
  } finally {
    await db.end({ timeout: 5 });
  }
}

function formatBriefing(data: Awaited<ReturnType<typeof runCompetitiveScan>>) {
  const date = new Date().toISOString().slice(0, 10);
  const errorCount = data.system_errors.reduce((acc, e) => acc + (e.count ?? 1), 0);
  const upsellsTop3 = (data.briefing_json?.opportunities ?? [])
    .slice()
    .sort((a: any, b: any) => (b.projected_revenue ?? 0) - (a.projected_revenue ?? 0))
    .slice(0, 3);

  const lines: string[] = [];
  lines.push(`Morning Briefing — ${date}`);
  lines.push("");
  if (data.briefing_json?.meta) {
    lines.push(
      `Snapshot: ${data.briefing_json.meta.alerts_found} alerts • ${data.briefing_json.meta.competitor_moves_found} competitor moves • ${data.briefing_json.meta.opportunities_found} opps • ${data.briefing_json.meta.scanned_client_count} clients scanned`,
    );
    lines.push("");
  }
  if (data.briefing_json?.focus_clients?.length) {
    lines.push("Clients to Focus");
    lines.push(`- ${data.briefing_json.focus_clients.slice(0, 8).join(", ")}`);
    lines.push("");
  }
  if (data.briefing_json?.critical_alerts?.length) {
    lines.push(`Critical Alerts (${data.briefing_json.critical_alerts.length})`);
    lines.push(
      data.briefing_json.critical_alerts
        .slice(0, 6)
        .map((a: any) => `- ${a.message}`)
        .join("\n"),
    );
    if (data.briefing_json.critical_alerts.length > 6) lines.push(`- …and ${data.briefing_json.critical_alerts.length - 6} more`);
    lines.push("");
  }
  if (data.briefing_json?.competitor_moves?.length) {
    lines.push(`Competitor Moves (${data.briefing_json.competitor_moves.length})`);
    lines.push(
      data.briefing_json.competitor_moves
        .slice(0, 5)
        .map((m: any) => `- ${m.client_name ?? "Client"} — ${m.competitor ? `${m.competitor}: ` : ""}${m.headline}${m.url ? ` (${m.url})` : ""}`)
        .join("\n"),
    );
    if (data.briefing_json.competitor_moves.length > 5) lines.push(`- …and ${data.briefing_json.competitor_moves.length - 5} more`);
    lines.push("");
  }
  if (data.briefing_json?.industry_news?.length) {
    lines.push("Industry News (Top)");
    lines.push(
      data.briefing_json.industry_news
        .slice(0, 5)
        .map((n: any) => `- ${n.headline}${n.url ? ` (${n.url})` : ""}`)
        .join("\n"),
    );
    lines.push("");
  }
  if (upsellsTop3.length) {
    lines.push("Top Opportunities (Today)");
    lines.push(
      upsellsTop3
        .map((o: any) => `- ${o.client_name ?? "Client"}: ${o.title}${o.projected_revenue ? ` — ${fmtMoney(o.projected_revenue)}` : ""}`)
        .join("\n"),
    );
    lines.push("");
  }
  lines.push(`New Leads (${data.new_leads.length})`);
  lines.push(data.new_leads.length ? `- ${data.new_leads.map((l) => l.name).slice(0, 25).join(", ")}` : "- None");
  lines.push("");
  lines.push(`At-Risk Clients (${data.at_risk_clients.length})`);
  lines.push(
    data.at_risk_clients.length
      ? data.at_risk_clients
          .slice(0, 10)
          .map((c) => `- ${c.name}${c.metric_name ? ` — ${c.metric_name}` : ""}${typeof c.delta === "number" ? `: Δ${c.delta}` : ""}`)
          .join("\n")
      : "- None",
  );
  lines.push("");
  lines.push("Upsell Opportunities (Top 3)");
  lines.push(
    upsellsTop3.length
      ? upsellsTop3
          .map((u) => `- ${u.client_name}${u.offer ? ` — ${u.offer}` : ""}${u.projected_revenue ? ` — ${fmtMoney(u.projected_revenue)}` : ""}`)
          .join("\n")
      : "- None",
  );
  lines.push("");
  lines.push("Tasks Due Today");
  lines.push(
    data.tasks_due_today.length
      ? data.tasks_due_today
          .slice(0, 15)
          .map((t) => `- ${t.title}${t.owner ? ` — ${t.owner}` : ""}${t.priority ? ` — ${t.priority}` : ""}`)
          .join("\n")
      : "- None",
  );
  lines.push("");
  lines.push("System Health");
  lines.push(errorCount ? `- Errors: ${errorCount}` : "- All clear");
  if (errorCount) {
    for (const e of data.system_errors.slice(0, 10)) {
      lines.push(`  - ${e.service ? `${e.service}: ` : ""}${e.message}${typeof e.count === "number" ? ` (${e.count})` : ""}`);
    }
  }
  return lines.join("\n").trim();
}

async function sendTelegram(message: string) {
  const token = env("TELEGRAM_BOT_TOKEN");
  const chatId = env("TELEGRAM_CHAT_ID");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required in .env.local");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is required in .env.local");

  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${text}`);
  return text;
}

async function main() {
  // South Africa time target:
  // 07:15 SAST (UTC+2) == 05:15 UTC
  const queryAt = nextUtcTimeToday(5, 0);
  const sendAt = nextUtcTimeToday(5, 15);

  if (Date.now() < queryAt.getTime()) {
    await sleep(msUntil(queryAt));
  }

  const scan = await runCompetitiveScan();
  const message = formatBriefing(scan);

  if (Date.now() < sendAt.getTime()) {
    await sleep(msUntil(sendAt));
  }

  // Urgent heads-up if big drops are detected (best-effort, simple heuristic).
  const critical = (scan.briefing_json?.critical_alerts ?? []).filter((a: any) => a.severity === "critical" || a.severity === "high");
  if (critical.length) {
    const focus = Array.from(new Set(critical.map((a: any) => a.client_name).filter(Boolean))).slice(0, 8);
    const urgent = `🚩 CRITICAL ALERTS (${critical.length})\n- Focus: ${focus.length ? focus.join(", ") : "Review briefing for details"}`;
    await sendTelegram(urgent);
    await sleep(750); // avoid Telegram rate bumps
  }

  const sendResult = await sendTelegram(message);

  // Store briefing record.
  const pgUrl = env("BRIEFING_PG_URL");
  const db = postgres(pgUrl, { max: 5, prepare: false });
  try {
    await ensureBriefingsTable(db);
    const id = `brief_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const date = new Date().toISOString().slice(0, 10);
    const alertsFound = critical.length;
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
        ${scan.briefing_json?.meta?.scanned_client_count ?? 0},
        ${alertsFound},
        ${scan.briefing_json?.meta?.competitor_moves_found ?? 0},
        ${scan.briefing_json?.meta?.opportunities_found ?? 0},
        ${(scan.briefing_json ?? null) as any},
        ${message}
      )
    `;
  } finally {
    await db.end({ timeout: 5 });
  }

  void sendResult;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

