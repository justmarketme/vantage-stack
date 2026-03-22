#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import postgres from "postgres";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const ClientProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string().optional(),
  competitors: z.array(z.string()).default([]),
});

const ClientMetricsSchema = z.object({
  client_id: z.string(),
  traffic: z.number().optional(),
  conversions: z.number().optional(),
  cost_per_lead: z.number().optional(),
  avg_7d_traffic: z.number().optional(),
  avg_7d_conversions: z.number().optional(),
  avg_7d_cpl: z.number().optional(),
});

const NewsArticleSchema = z.object({
  title: z.string(),
  url: z.string().optional(),
  source: z.string().optional(),
  published_at: z.string().optional(),
  snippet: z.string().optional(),
  matched_terms: z.array(z.string()).default([]),
  client_id: z.string().optional(),
});

const OvernightDataSchema = z.object({
  generated_at: z.string(),
  window: z.object({
    since_iso: z.string(),
    until_iso: z.string(),
    timezone: z.string(),
  }),
  new_leads: z.array(z.object({ id: z.string().optional(), name: z.string(), created_at: z.string().optional() })).default([]),
  at_risk_clients: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        metric_name: z.string().optional(),
        yesterday_value: z.number().optional(),
        today_value: z.number().optional(),
        delta: z.number().optional(),
        notes: z.string().optional(),
      }),
    )
    .default([]),
  upsell_opportunities: z
    .array(
      z.object({
        id: z.string().optional(),
        client_name: z.string(),
        offer: z.string().optional(),
        projected_revenue: z.number().optional(),
        confidence: z.number().min(0).max(1).optional(),
        notes: z.string().optional(),
      }),
    )
    .default([]),
  tasks_due_today: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string(),
        owner: z.string().optional(),
        due_date: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "critical"]).optional(),
      }),
    )
    .default([]),
  system_health: z.object({
    api_errors: z.array(z.object({ service: z.string().optional(), message: z.string(), count: z.number().int().optional() })).default([]),
    failed_automations: z
      .array(z.object({ name: z.string(), message: z.string().optional(), count: z.number().int().optional() }))
      .default([]),
  }),
  clients_scanned: z.number().int().default(0),
  client_profiles: z.array(ClientProfileSchema).default([]),
  client_metrics: z.array(ClientMetricsSchema).default([]),
  briefing_json: z
    .object({
      critical_alerts: z
        .array(
          z.object({
            client_id: z.string().optional(),
            client_name: z.string().optional(),
            type: z.string(),
            severity: z.enum(["high", "critical"]),
            message: z.string(),
          }),
        )
        .default([]),
      competitor_moves: z
        .array(
          z.object({
            client_id: z.string().optional(),
            client_name: z.string().optional(),
            competitor: z.string().optional(),
            headline: z.string(),
            url: z.string().optional(),
            published_at: z.string().optional(),
            why_it_matters: z.string().optional(),
          }),
        )
        .default([]),
      industry_news: z
        .array(
          z.object({
            client_id: z.string().optional(),
            client_name: z.string().optional(),
            headline: z.string(),
            url: z.string().optional(),
            published_at: z.string().optional(),
            summary: z.string().optional(),
          }),
        )
        .default([]),
      opportunities: z
        .array(
          z.object({
            client_id: z.string().optional(),
            client_name: z.string().optional(),
            title: z.string(),
            rationale: z.string().optional(),
            projected_revenue: z.number().optional(),
          }),
        )
        .default([]),
      focus_clients: z.array(z.string()).default([]),
      meta: z
        .object({
          alerts_found: z.number().int().default(0),
          competitor_moves_found: z.number().int().default(0),
          opportunities_found: z.number().int().default(0),
          scanned_client_count: z.number().int().default(0),
        })
        .default({ alerts_found: 0, competitor_moves_found: 0, opportunities_found: 0, scanned_client_count: 0 }),
    })
    .default({
      critical_alerts: [],
      competitor_moves: [],
      industry_news: [],
      opportunities: [],
      focus_clients: [],
      meta: { alerts_found: 0, competitor_moves_found: 0, opportunities_found: 0, scanned_client_count: 0 },
    }),
});

type OvernightData = z.infer<typeof OvernightDataSchema>;

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function isoNow() {
  return new Date().toISOString();
}

function defaultWindow(timezone: string, sinceIso?: string, untilIso?: string) {
  // Keep it simple/robust: treat “overnight” as previous calendar day end → now when not provided.
  // Callers can provide explicit ISO strings to match their DB semantics.
  const until = untilIso ? new Date(untilIso) : new Date();
  const since = sinceIso ? new Date(sinceIso) : new Date(until.getTime() - 12 * 60 * 60 * 1000);
  return { since, until, timezone };
}

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function safeNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function fmtMoney(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function pct(delta: number | undefined, base: number | undefined): string | null {
  if (typeof delta !== "number" || typeof base !== "number" || !Number.isFinite(delta) || !Number.isFinite(base) || base === 0) return null;
  return `${Math.round((delta / base) * 1000) / 10}%`;
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

function normalizeNewsArticle(a: any, matchedTerms: string[], clientId?: string): z.infer<typeof NewsArticleSchema> {
  return NewsArticleSchema.parse({
    title: String(a?.title ?? "Untitled"),
    url: typeof a?.url === "string" ? a.url : undefined,
    source: typeof a?.source?.name === "string" ? a.source.name : typeof a?.source === "string" ? a.source : undefined,
    published_at: typeof a?.publishedAt === "string" ? a.publishedAt : typeof a?.published_at === "string" ? a.published_at : undefined,
    snippet: typeof a?.description === "string" ? a.description : typeof a?.snippet === "string" ? a.snippet : undefined,
    matched_terms: matchedTerms,
    client_id: clientId,
  });
}

function computeClientTrafficAlert(m: z.infer<typeof ClientMetricsSchema>): { severity: "high" | "critical"; message: string } | null {
  const traffic = m.traffic;
  const avg = m.avg_7d_traffic;
  if (typeof traffic !== "number" || typeof avg !== "number" || !Number.isFinite(traffic) || !Number.isFinite(avg) || avg <= 0) return null;
  const drop = (traffic - avg) / avg;
  if (drop <= -0.1) {
    const severity: "high" | "critical" = drop <= -0.25 ? "critical" : "high";
    return { severity, message: `Traffic down ${Math.round(Math.abs(drop) * 1000) / 10}% vs 7‑day avg.` };
  }
  return null;
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
  const articles = Array.isArray(json?.articles) ? json.articles : [];
  return articles;
}

async function queryOvernightData(params: {
  pg_url?: string;
  since_iso?: string;
  until_iso?: string;
  timezone?: string;
  sql?: Partial<{
    new_leads: string;
    at_risk_clients: string;
    upsell_opportunities: string;
    tasks_due_today: string;
    system_errors: string;
    active_clients: string;
    client_weekly_metrics: string;
    store_briefing: string;
  }>;
}): Promise<OvernightData> {
  const timezone = params.timezone?.trim() || env("BRIEFING_TIMEZONE") || "UTC";
  const w = defaultWindow(timezone, params.since_iso, params.until_iso);

  const pgUrl = params.pg_url?.trim() || env("BRIEFING_PG_URL");
  if (!pgUrl) throw new Error("BRIEFING_PG_URL is required (or pass pg_url).");

  const sql = {
    new_leads:
      params.sql?.new_leads ||
      env("BRIEFING_SQL_NEW_LEADS") ||
      `select id::text as id, name::text as name, created_at::text as created_at
from blueprint_submissions
where created_at >= $1 and created_at < $2
order by created_at desc
limit 50`,
    at_risk_clients:
      params.sql?.at_risk_clients ||
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
      params.sql?.upsell_opportunities ||
      env("BRIEFING_SQL_UPSELL_OPPORTUNITIES") ||
      `select id::text as id, client_name::text as client_name, offer::text as offer,
       projected_revenue::float8 as projected_revenue, confidence::float8 as confidence, notes::text as notes
from upsell_opportunities
where status = 'ready'
order by projected_revenue desc nulls last
limit 25`,
    tasks_due_today:
      params.sql?.tasks_due_today ||
      env("BRIEFING_SQL_TASKS_DUE_TODAY") ||
      `select id::text as id, title::text as title, owner::text as owner,
       due_date::text as due_date, priority::text as priority
from tasks
where due_date = (current_date at time zone $3)
  and (status is null or status not in ('done','completed'))
order by priority desc nulls last, id desc
limit 50`,
    system_errors:
      params.sql?.system_errors ||
      env("BRIEFING_SQL_SYSTEM_ERRORS") ||
      `select service::text as service, message::text as message, count(*)::int as count
from system_errors
where created_at >= $1 and created_at < $2
group by service, message
order by count(*) desc
limit 25`,
    active_clients:
      params.sql?.active_clients ||
      env("BRIEFING_SQL_ACTIVE_CLIENTS") ||
      `select id::text as id, name::text as name, industry::text as industry, competitors::text as competitors
from clients
where (status is null or status = 'active')
order by name asc
limit 200`,
    client_weekly_metrics:
      params.sql?.client_weekly_metrics ||
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
    store_briefing: params.sql?.store_briefing || env("BRIEFING_SQL_STORE_BRIEFING") || "",
  };

  const db = postgres(pgUrl, { max: 5, prepare: false });
  try {
    const sinceIso = w.since.toISOString();
    const untilIso = w.until.toISOString();

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
    const newLeads = newLeadsR.status === "fulfilled" ? newLeadsR.value : [];
    const atRisk = atRiskR.status === "fulfilled" ? atRiskR.value : [];
    const upsells = upsellsR.status === "fulfilled" ? upsellsR.value : [];
    const tasks = tasksR.status === "fulfilled" ? tasksR.value : [];
    const systemErrors = systemErrorsR.status === "fulfilled" ? systemErrorsR.value : [];
    const activeClients = activeClientsR.status === "fulfilled" ? activeClientsR.value : [];
    const clientMetrics = clientMetricsR.status === "fulfilled" ? clientMetricsR.value : [];

    const failed: Array<{ name: string; message: string }> = [];
    if (newLeadsR.status === "rejected") failed.push({ name: "query:new_leads", message: String(newLeadsR.reason ?? "failed") });
    if (atRiskR.status === "rejected") failed.push({ name: "query:at_risk_clients", message: String(atRiskR.reason ?? "failed") });
    if (upsellsR.status === "rejected") failed.push({ name: "query:upsell_opportunities", message: String(upsellsR.reason ?? "failed") });
    if (tasksR.status === "rejected") failed.push({ name: "query:tasks_due_today", message: String(tasksR.reason ?? "failed") });
    if (systemErrorsR.status === "rejected") failed.push({ name: "query:system_errors", message: String(systemErrorsR.reason ?? "failed") });
    if (activeClientsR.status === "rejected") failed.push({ name: "query:active_clients", message: String(activeClientsR.reason ?? "failed") });
    if (clientMetricsR.status === "rejected") failed.push({ name: "query:client_weekly_metrics", message: String(clientMetricsR.reason ?? "failed") });

    const parsed: OvernightData = OvernightDataSchema.parse({
      generated_at: isoNow(),
      window: { since_iso: sinceIso, until_iso: untilIso, timezone },
      new_leads: (newLeads ?? []).map((r: any) => ({ id: r.id ?? undefined, name: String(r.name ?? "Unknown"), created_at: r.created_at ?? undefined })),
      at_risk_clients: (atRisk ?? []).map((r: any) => ({
        id: r.id ?? undefined,
        name: String(r.name ?? "Unknown"),
        metric_name: r.metric_name ?? undefined,
        yesterday_value: safeNumber(r.yesterday_value),
        today_value: safeNumber(r.today_value),
        delta: safeNumber(r.delta),
        notes: r.notes ?? undefined,
      })),
      upsell_opportunities: (upsells ?? []).map((r: any) => ({
        id: r.id ?? undefined,
        client_name: String(r.client_name ?? "Unknown"),
        offer: r.offer ?? undefined,
        projected_revenue: safeNumber(r.projected_revenue),
        confidence: safeNumber(r.confidence),
        notes: r.notes ?? undefined,
      })),
      tasks_due_today: (tasks ?? []).map((r: any) => ({
        id: r.id ?? undefined,
        title: String(r.title ?? "Untitled"),
        owner: r.owner ?? undefined,
        due_date: r.due_date ?? undefined,
        priority: (r.priority as any) ?? undefined,
      })),
      system_health: {
        api_errors: (systemErrors ?? []).map((r: any) => ({
          service: r.service ?? undefined,
          message: String(r.message ?? "Unknown error"),
          count: typeof r.count === "number" ? r.count : undefined,
        })),
        failed_automations: failed.map((f) => ({ name: f.name, message: f.message, count: 1 })),
      },
      client_profiles: (activeClients ?? []).map((r: any) => ({
        id: String(r.id ?? r.client_id ?? ""),
        name: String(r.name ?? r.client_name ?? "Unknown"),
        industry: r.industry ? String(r.industry) : undefined,
        competitors: parseCompetitors(r.competitors ?? r.top_competitors ?? r.competitor_names),
      })),
      clients_scanned: Array.isArray(activeClients) ? activeClients.length : 0,
      client_metrics: (clientMetrics ?? []).map((r: any) => ({
        client_id: String(r.client_id ?? r.id ?? ""),
        traffic: safeNumber(r.traffic),
        conversions: safeNumber(r.conversions),
        cost_per_lead: safeNumber(r.cost_per_lead ?? r.cpl),
        avg_7d_traffic: safeNumber(r.avg_7d_traffic),
        avg_7d_conversions: safeNumber(r.avg_7d_conversions),
        avg_7d_cpl: safeNumber(r.avg_7d_cpl),
      })),
    });

    // Competitive + metrics intelligence (best-effort; never fail the whole run).
    const newsKey = env("BRIEFING_NEWS_API_KEY");
    const fromIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const toIso = new Date().toISOString();

    const metricsByClient = new Map(parsed.client_metrics.map((m) => [m.client_id, m]));
    const criticalAlerts: OvernightData["briefing_json"]["critical_alerts"] = [];

    for (const c of parsed.client_profiles) {
      const m = metricsByClient.get(c.id);
      if (m) {
        const alert = computeClientTrafficAlert(m);
        if (alert) {
          criticalAlerts.push({
            client_id: c.id,
            client_name: c.name,
            type: "traffic_drop_vs_7d_avg",
            severity: alert.severity,
            message: `${c.name}: ${alert.message}`,
          });
        }
      }
    }

    const competitorMoves: OvernightData["briefing_json"]["competitor_moves"] = [];
    const industryNews: OvernightData["briefing_json"]["industry_news"] = [];
    const opportunities: OvernightData["briefing_json"]["opportunities"] = [];

    // News scanning per client (limited to keep runtime manageable).
    if (newsKey) {
      const maxClients = Math.min(30, parsed.client_profiles.length);
      for (const c of parsed.client_profiles.slice(0, maxClients)) {
        const terms = [c.industry, ...c.competitors].filter(Boolean).slice(0, 4) as string[];
        if (!terms.length) continue;

        const q = terms.map((t) => `"${t}"`).join(" OR ");
        try {
          const articles = await fetchNewsEverything({ apiKey: newsKey, q, fromIso, toIso, pageSize: 6 });
          for (const a of articles) {
            const hay = `${a?.title ?? ""} ${a?.description ?? ""}`.toLowerCase();
            const matched = terms.filter((t) => hay.includes(t.toLowerCase()));
            const norm = normalizeNewsArticle(a, matched, c.id);

            // Heuristic: competitor move if competitor name is matched; otherwise industry news.
            const matchedCompetitor = c.competitors.find((comp) => hay.includes(comp.toLowerCase()));
            if (matchedCompetitor) {
              competitorMoves.push({
                client_id: c.id,
                client_name: c.name,
                competitor: matchedCompetitor,
                headline: norm.title,
                url: norm.url,
                published_at: norm.published_at,
                why_it_matters: `Competitor visibility/campaign signal for ${c.name}.`,
              });
            } else {
              industryNews.push({
                client_id: c.id,
                client_name: c.name,
                headline: norm.title,
                url: norm.url,
                published_at: norm.published_at,
                summary: norm.snippet,
              });
            }
          }
        } catch (e: any) {
          parsed.system_health.failed_automations.push({ name: "news_scan", message: `${c.name}: ${String(e?.message ?? e)}`, count: 1 });
        }
      }

      // Platform/algorithm updates (global scan).
      try {
        const updates = await fetchNewsEverything({
          apiKey: newsKey,
          q: `("Google algorithm update" OR "Google Search update" OR "Meta Ads update" OR "TikTok Ads update" OR "LinkedIn Ads update")`,
          fromIso,
          toIso,
          pageSize: 6,
        });
        for (const a of updates) {
          const norm = normalizeNewsArticle(a, [], undefined);
          industryNews.unshift({
            headline: norm.title,
            url: norm.url,
            published_at: norm.published_at,
            summary: norm.snippet,
          });
        }
      } catch (e: any) {
        parsed.system_health.failed_automations.push({ name: "platform_updates_scan", message: String(e?.message ?? e), count: 1 });
      }
    } else {
      parsed.system_health.failed_automations.push({
        name: "news_scan",
        message: "BRIEFING_NEWS_API_KEY not set; competitive/industry news scanning skipped.",
        count: 1,
      });
    }

    // Opportunities: existing upsells + competitor moves + traffic drops (play defense/attack).
    for (const u of parsed.upsell_opportunities.slice().sort((a, b) => (b.projected_revenue ?? 0) - (a.projected_revenue ?? 0)).slice(0, 10)) {
      opportunities.push({
        client_name: u.client_name,
        title: u.offer ? `Upsell: ${u.offer}` : "Upsell: ready to push",
        rationale: u.notes,
        projected_revenue: u.projected_revenue,
      });
    }

    for (const move of competitorMoves.slice(0, 10)) {
      opportunities.push({
        client_id: move.client_id,
        client_name: move.client_name,
        title: `Counter-move for ${move.competitor ?? "competitor"}`,
        rationale: `Competitor activity detected: ${move.headline}`,
      });
    }

    // Focus clients: those with critical alerts first, then highest-revenue upsells.
    const focus = new Set<string>();
    for (const a of criticalAlerts) if (a.client_name) focus.add(a.client_name);
    for (const u of parsed.upsell_opportunities.slice(0, 5)) focus.add(u.client_name);

    parsed.briefing_json = {
      critical_alerts: criticalAlerts,
      competitor_moves: competitorMoves.slice(0, 50),
      industry_news: industryNews.slice(0, 50),
      opportunities: opportunities.slice(0, 50),
      focus_clients: Array.from(focus).slice(0, 10),
      meta: {
        alerts_found: criticalAlerts.length,
        competitor_moves_found: competitorMoves.length,
        opportunities_found: opportunities.length,
        scanned_client_count: parsed.client_profiles.length,
      },
    };

    return parsed;
  } finally {
    await db.end({ timeout: 5 });
  }
}

const IdentifyPrioritiesInput = z.object({
  data: OvernightDataSchema,
});

function identifyPriorities(data: OvernightData) {
  const priorities: Array<{ title: string; why: string; severity: "low" | "medium" | "high" | "critical" }> = [];

  const topAtRisk = data.at_risk_clients
    .slice()
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
    .slice(0, 5)
    .map((c) => c.name);
  if (topAtRisk.length) {
    priorities.push({
      title: `Stabilize at-risk clients (${topAtRisk.length})`,
      why: `Declining metrics detected for: ${topAtRisk.join(", ")}.`,
      severity: "critical",
    });
  }

  const upsellsTop = data.upsell_opportunities
    .slice()
    .sort((a, b) => (b.projected_revenue ?? 0) - (a.projected_revenue ?? 0))
    .slice(0, 3);
  if (upsellsTop.length) {
    priorities.push({
      title: "Push top upsells today",
      why: `Top 3 projected revenue: ${upsellsTop
        .map((u) => `${u.client_name}${u.projected_revenue ? ` (${fmtMoney(u.projected_revenue)})` : ""}`)
        .join(", ")}.`,
      severity: "high",
    });
  }

  if (data.tasks_due_today.length) {
    priorities.push({
      title: `Clear tasks due today (${data.tasks_due_today.length})`,
      why: "Prevent delivery slip and unblock downstream work.",
      severity: data.tasks_due_today.length >= 8 ? "high" : "medium",
    });
  }

  const errorCount = data.system_health.api_errors.reduce((acc, e) => acc + (e.count ?? 1), 0);
  if (errorCount) {
    priorities.push({
      title: `Fix system errors (${errorCount})`,
      why: "Errors/failures overnight can silently block lead flow or automations.",
      severity: errorCount >= 10 ? "high" : "medium",
    });
  }

  return {
    priorities,
    upsell_top_3: upsellsTop,
  };
}

const DetectAnomaliesInput = z.object({
  data: OvernightDataSchema,
  thresholds: z
    .object({
      at_risk_delta_abs: z.number().optional().default(0),
      api_error_count: z.number().int().optional().default(1),
      new_leads_spike: z.number().int().optional().default(25),
    })
    .optional(),
});

function detectAnomalies(data: OvernightData, thresholds?: z.infer<typeof DetectAnomaliesInput>["thresholds"]) {
  const t = {
    at_risk_delta_abs: thresholds?.at_risk_delta_abs ?? 0,
    api_error_count: thresholds?.api_error_count ?? 1,
    new_leads_spike: thresholds?.new_leads_spike ?? 25,
  };

  const anomalies: Array<{ type: string; severity: "low" | "medium" | "high" | "critical"; message: string }> = [];

  const largeDrops = data.at_risk_clients.filter((c) => typeof c.delta === "number" && c.delta < -Math.abs(t.at_risk_delta_abs));
  if (largeDrops.length) {
    anomalies.push({
      type: "client_metric_drop",
      severity: largeDrops.length >= 3 ? "critical" : "high",
      message: `Large metric drops: ${largeDrops
        .slice(0, 5)
        .map((c) => `${c.name}${c.metric_name ? ` (${c.metric_name})` : ""}${typeof c.delta === "number" ? ` Δ${c.delta}` : ""}`)
        .join(", ")}.`,
    });
  }

  const apiErr = data.system_health.api_errors.reduce((acc, e) => acc + (e.count ?? 1), 0);
  if (apiErr >= t.api_error_count) {
    anomalies.push({
      type: "system_errors",
      severity: apiErr >= 20 ? "critical" : apiErr >= 10 ? "high" : "medium",
      message: `API/errors overnight: ${apiErr}.`,
    });
  }

  if (data.new_leads.length >= t.new_leads_spike) {
    anomalies.push({
      type: "new_leads_spike",
      severity: "medium",
      message: `New leads spike: ${data.new_leads.length} submissions in the overnight window.`,
    });
  }

  return { anomalies };
}

const FormatBriefingInput = z.object({
  data: OvernightDataSchema,
  priorities: z.array(z.any()).optional(),
  anomalies: z.array(z.any()).optional(),
  title: z.string().optional(),
});

function formatBriefing(params: z.infer<typeof FormatBriefingInput>): string {
  const { data } = params;

  const title = (params.title || "Morning Briefing").trim();
  const date = new Date().toISOString().slice(0, 10);

  const newLeadsNames = data.new_leads.map((l) => l.name).slice(0, 25);
  const atRisk = data.at_risk_clients
    .slice()
    .sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0))
    .slice(0, 10);
  const upsells = data.upsell_opportunities
    .slice()
    .sort((a, b) => (b.projected_revenue ?? 0) - (a.projected_revenue ?? 0))
    .slice(0, 3);
  const tasks = data.tasks_due_today.slice(0, 15);
  const errors = data.system_health.api_errors.slice(0, 10);

  const lines: string[] = [];
  lines.push(`${title} — ${date}`);
  lines.push("");

  // Competitive intel headline rollup (2-minute readable).
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
    for (const a of data.briefing_json.critical_alerts.slice(0, 6)) lines.push(`- ${a.message}`);
    if (data.briefing_json.critical_alerts.length > 6) lines.push(`- …and ${data.briefing_json.critical_alerts.length - 6} more`);
    lines.push("");
  }

  if (data.briefing_json?.competitor_moves?.length) {
    lines.push(`Competitor Moves (${data.briefing_json.competitor_moves.length})`);
    for (const m of data.briefing_json.competitor_moves.slice(0, 5)) {
      lines.push(`- ${m.client_name ?? "Client"} — ${m.competitor ? `${m.competitor}: ` : ""}${m.headline}${m.url ? ` (${m.url})` : ""}`);
    }
    if (data.briefing_json.competitor_moves.length > 5) lines.push(`- …and ${data.briefing_json.competitor_moves.length - 5} more`);
    lines.push("");
  }

  if (data.briefing_json?.industry_news?.length) {
    lines.push("Industry News (Top)");
    for (const n of data.briefing_json.industry_news.slice(0, 5)) {
      lines.push(`- ${n.headline}${n.url ? ` (${n.url})` : ""}`);
    }
    lines.push("");
  }

  if (data.briefing_json?.opportunities?.length) {
    lines.push("Top Opportunities (Today)");
    for (const o of data.briefing_json.opportunities.slice(0, 3)) {
      lines.push(`- ${o.client_name ?? "Client"}: ${o.title}${o.projected_revenue ? ` — ${fmtMoney(o.projected_revenue)}` : ""}`);
    }
    lines.push("");
  }

  lines.push(`New Leads (${data.new_leads.length})`);
  lines.push(newLeadsNames.length ? `- ${newLeadsNames.join(", ")}` : "- None");
  lines.push("");

  lines.push(`At-Risk Clients (${data.at_risk_clients.length})`);
  if (!atRisk.length) {
    lines.push("- None");
  } else {
    for (const c of atRisk) {
      const d = typeof c.delta === "number" ? `Δ${c.delta}` : "Δ—";
      const p = pct(c.delta, c.yesterday_value);
      lines.push(`- ${c.name}${c.metric_name ? ` — ${c.metric_name}` : ""}: ${d}${p ? ` (${p})` : ""}${c.notes ? ` — ${c.notes}` : ""}`);
    }
  }
  lines.push("");

  lines.push("Upsell Opportunities (Top 3)");
  if (!upsells.length) {
    lines.push("- None");
  } else {
    for (const u of upsells) {
      lines.push(
        `- ${u.client_name}${u.offer ? ` — ${u.offer}` : ""}${u.projected_revenue ? ` — ${fmtMoney(u.projected_revenue)}` : ""}${
          typeof u.confidence === "number" ? ` — conf ${Math.round(u.confidence * 100)}%` : ""
        }${u.notes ? ` — ${u.notes}` : ""}`,
      );
    }
  }
  lines.push("");

  lines.push("Tasks Due Today");
  if (!tasks.length) {
    lines.push("- None");
  } else {
    for (const t of tasks) {
      lines.push(`- ${t.title}${t.owner ? ` — ${t.owner}` : ""}${t.priority ? ` — ${t.priority}` : ""}`);
    }
  }
  lines.push("");

  const errorCount = data.system_health.api_errors.reduce((acc, e) => acc + (e.count ?? 1), 0);
  lines.push("System Health");
  if (!errorCount) {
    lines.push("- All clear");
  } else {
    lines.push(`- Errors: ${errorCount}`);
    for (const e of errors) {
      lines.push(`  - ${e.service ? `${e.service}: ` : ""}${e.message}${typeof e.count === "number" ? ` (${e.count})` : ""}`);
    }
  }

  if (Array.isArray(params.anomalies) && params.anomalies.length) {
    lines.push("");
    lines.push("Anomalies");
    for (const a of params.anomalies.slice(0, 8) as any[]) {
      lines.push(`- ${a.message ?? JSON.stringify(a)}`);
    }
  }

  if (Array.isArray(params.priorities) && params.priorities.length) {
    lines.push("");
    lines.push("Today’s Priorities");
    for (const p of params.priorities.slice(0, 8) as any[]) {
      lines.push(`- ${p.title ?? JSON.stringify(p)}${p.why ? ` — ${p.why}` : ""}`);
    }
  }

  return lines.join("\n").trim();
}

const SendTelegramBriefingInput = z.object({
  message: z.string().min(1),
  chat_id: z.string().optional(),
  bot_token: z.string().optional(),
  disable_web_page_preview: z.boolean().optional().default(true),
  urgent: z.boolean().optional().default(false),
  urgent_prefix: z.string().optional(),
  store: z
    .object({
      pg_url: z.string().optional(),
      briefing_date: z.string().optional(),
      client_count_scanned: z.number().int().optional(),
      alerts_found: z.number().int().optional(),
      competitor_moves_found: z.number().int().optional(),
      opportunities_found: z.number().int().optional(),
      briefing_json: z.any().optional(),
    })
    .optional(),
});

async function sendTelegramBriefing(params: z.infer<typeof SendTelegramBriefingInput>) {
  const token = (params.bot_token || env("TELEGRAM_BOT_TOKEN")).trim();
  const chatId = (params.chat_id || env("TELEGRAM_CHAT_ID")).trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required (or pass bot_token).");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is required (or pass chat_id).");

  const prefix = params.urgent ? (params.urgent_prefix ?? "🚩 ").trimEnd() + " " : "";
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: `${prefix}${params.message}`,
      disable_web_page_preview: params.disable_web_page_preview ?? true,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${text}`);

  // Optional persistence into Postgres briefings table.
  if (params.store) {
    const pgUrl = (params.store.pg_url || env("BRIEFING_PG_URL")).trim();
    if (pgUrl) {
      const db = postgres(pgUrl, { max: 5, prepare: false });
      try {
        await ensureBriefingsTable(db);
        const id = `brief_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const date = (params.store.briefing_date || new Date().toISOString().slice(0, 10)).slice(0, 10);
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
            ${params.store.client_count_scanned ?? 0},
            ${params.store.alerts_found ?? 0},
            ${params.store.competitor_moves_found ?? 0},
            ${params.store.opportunities_found ?? 0},
            ${(params.store.briefing_json ?? null) as any},
            ${params.message}
          )
        `;
      } finally {
        await db.end({ timeout: 5 });
      }
    }
  }
  return text;
}

const server = new Server({ name: "briefing-generator", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query-overnight-data",
        description:
          "Query the database for overnight changes: new leads, at-risk clients, upsell opportunities, tasks due today, and system errors.",
        inputSchema: {
          type: "object",
          properties: {
            pg_url: { type: "string", description: "Postgres URL. Defaults to BRIEFING_PG_URL." },
            since_iso: { type: "string", description: "ISO start time for the overnight window." },
            until_iso: { type: "string", description: "ISO end time for the overnight window." },
            timezone: { type: "string", description: "Timezone label (for downstream SQL). Defaults to BRIEFING_TIMEZONE or UTC." },
            sql: { type: "object", description: "Optional SQL overrides per query. Use $1/$2/$3 for since/until/timezone." },
          },
        },
      },
      {
        name: "identify-priorities",
        description: "Prioritize the day based on overnight data (at-risk first, revenue next, delivery/ops next).",
        inputSchema: { type: "object", properties: { data: { type: "object" } }, required: ["data"] },
      },
      {
        name: "detect-anomalies",
        description: "Detect notable anomalies/spikes (metric drops, error spikes, lead spikes).",
        inputSchema: {
          type: "object",
          properties: { data: { type: "object" }, thresholds: { type: "object" } },
          required: ["data"],
        },
      },
      {
        name: "format-briefing",
        description:
          "Format the morning briefing message: New Leads, At-Risk Clients, Upsell Opportunities, Tasks Due Today, System Health.",
        inputSchema: { type: "object", properties: { data: { type: "object" }, priorities: { type: "array" }, anomalies: { type: "array" }, title: { type: "string" } }, required: ["data"] },
      },
      {
        name: "send-telegram-briefing",
        description: "Send a clean text briefing to Telegram via bot token + chat ID. Can optionally mark as urgent and/or store to Postgres.",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string" },
            chat_id: { type: "string" },
            bot_token: { type: "string" },
            disable_web_page_preview: { type: "boolean" },
            urgent: { type: "boolean", description: "If true, prefixes message with 🚩." },
            urgent_prefix: { type: "string" },
            store: { type: "object", description: "Optional DB persistence fields (uses BRIEFING_PG_URL)."},
          },
          required: ["message"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  if (name === "query-overnight-data") {
    const out = await queryOvernightData({
      pg_url: typeof obj.pg_url === "string" ? obj.pg_url : undefined,
      since_iso: typeof obj.since_iso === "string" ? obj.since_iso : undefined,
      until_iso: typeof obj.until_iso === "string" ? obj.until_iso : undefined,
      timezone: typeof obj.timezone === "string" ? obj.timezone : undefined,
      sql: asObject(obj.sql ?? null) as any,
    });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "identify-priorities") {
    const parsed = IdentifyPrioritiesInput.parse({ data: obj.data });
    const out = identifyPriorities(parsed.data);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "detect-anomalies") {
    const parsed = DetectAnomaliesInput.parse({ data: obj.data, thresholds: obj.thresholds });
    const out = detectAnomalies(parsed.data, parsed.thresholds);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "format-briefing") {
    const parsed = FormatBriefingInput.parse({ data: obj.data, priorities: obj.priorities, anomalies: obj.anomalies, title: obj.title });
    const out = formatBriefing(parsed);
    return { content: [{ type: "text", text: out }] };
  }

  if (name === "send-telegram-briefing") {
    const parsed = SendTelegramBriefingInput.parse({
      message: obj.message,
      chat_id: obj.chat_id,
      bot_token: obj.bot_token,
      disable_web_page_preview: obj.disable_web_page_preview,
      urgent: obj.urgent,
      urgent_prefix: obj.urgent_prefix,
      store: obj.store,
    });
    const out = await sendTelegramBriefing(parsed);
    return { content: [{ type: "text", text: out }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

