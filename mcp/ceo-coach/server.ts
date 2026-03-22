#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import postgres, { type Sql } from "postgres";
import crypto from "crypto";
import { connectAnalyticsDb, ensureAnalyticsTables } from "../../lib/analytics/db";
import { calculateBusinessMetrics } from "../../lib/analytics/engine";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

type DateRange = { start_date?: string; end_date?: string };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function env(name: string) {
  return (process.env[name] || "").trim();
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function clampInt(n: number | undefined, fallback: number) {
  if (typeof n !== "number" || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function fmtMoney(n: number | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n <= -1_000_000) return `-$${Math.abs(n / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(n).toLocaleString()}`;
}

function safePct(n: number | undefined) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `${Math.round(n * 10) / 10}%`;
}

function addMonths(d: Date, months: number) {
  const out = new Date(d.getTime());
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function monthWindowUtc(params?: { month_start_iso?: string; month_end_iso?: string }) {
  const now = new Date();
  const start =
    typeof params?.month_start_iso === "string" && params.month_start_iso.trim()
      ? new Date(params.month_start_iso)
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  const end =
    typeof params?.month_end_iso === "string" && params.month_end_iso.trim()
      ? new Date(params.month_end_iso)
      : addMonths(start, 1);

  return {
    since: start,
    until: end,
  };
}

async function ensureCeoCoachTables(db: Sql) {
  // Idempotent: create the minimal set of tables required by the MCP tools.
  await db.unsafe(`
    create table if not exists ceo_company_goals (
      id integer primary key default 1,
      annual_revenue_target numeric default 0,
      monthly_recurring_revenue_target numeric default 0,
      monthly_new_clients_goal integer default 0,
      quarterly_new_clients_goal integer default 0,
      client_retention_goal_pct numeric default 0,
      avg_revenue_per_client_target numeric default 0,
      service_expansion_goals jsonb default '{}'::jsonb,
      team_growth_target integer default 0,
      market_expansion_goals jsonb default '{}'::jsonb,
      team_size_current integer default 5,
      team_rate_per_hour numeric default 100,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists ceo_company_goals_updated_idx on ceo_company_goals(updated_at);

    create table if not exists ceo_sops (
      id text primary key,
      parent_sop text not null default '',
      sop_type text not null default '',
      initiative_name text not null,
      status text not null default 'active',
      description text default '',
      version integer not null default 1,
      expected_client_demand_weight numeric default 1,

      dev_hours_per_client numeric default 0,
      support_hours_per_month_per_client numeric default 0,
      third_party_cost_per_client numeric default 0,
      third_party_cost_per_month_per_client numeric default 0,
      hosting_cost_per_month_per_client numeric default 0,
      pricing_one_time numeric default 0,
      pricing_mrr numeric default 0,
      estimated_client_lifetime_months integer default 12,

      automation_level numeric default 0.3,
      scaling_constraints text default '',

      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists ceo_sops_status_idx on ceo_sops(status);
    create index if not exists ceo_sops_type_idx on ceo_sops(sop_type);

    create table if not exists ceo_sop_version_history (
      id text primary key,
      sop_id text not null references ceo_sops(id) on delete cascade,
      version integer not null,
      created_at timestamptz not null default now(),
      sop_json jsonb not null
    );
    create index if not exists ceo_sop_version_history_sop_idx on ceo_sop_version_history(sop_id, version desc);

    create table if not exists ceo_kpis (
      id text primary key,
      name text not null,
      description text not null default '',
      unit text not null default '',
      target_value numeric default null
    );

    create table if not exists ceo_sop_kpi_links (
      id text primary key,
      sop_id text not null references ceo_sops(id) on delete cascade,
      kpi_id text not null references ceo_kpis(id) on delete cascade,
      weight numeric not null default 1,
      created_at timestamptz not null default now(),
      unique(sop_id, kpi_id)
    );

    create table if not exists ceo_sop_performance_monthly (
      id text primary key,
      sop_id text not null references ceo_sops(id) on delete cascade,
      month date not null,
      active_clients_count integer default 0,
      revenue_generated numeric default 0,
      cost_to_deliver numeric default 0,
      gross_margin numeric default 0,
      client_satisfaction_score numeric default null,
      churn_rate numeric default null,
      nps numeric default null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(sop_id, month)
    );

    create table if not exists ceo_coach_briefings (
      id text primary key,
      briefing_date date not null,
      created_at timestamptz not null default now(),
      month_start date not null,
      month_end date not null,
      briefing_text text not null,
      briefing_json jsonb not null
    );
    create index if not exists ceo_coach_briefings_date_idx on ceo_coach_briefings(briefing_date);
  `);
}

async function getDb(): Promise<Sql> {
  const db = connectAnalyticsDb();
  if (!db) throw new Error("Missing database URL. Set DATABASE_URL (or SUPABASE_DB_URL / REPORTS_PG_URL / WEEKLY_PG_URL).");
  return db;
}

async function ensureGoalsRow(db: Sql): Promise<{
  annual_revenue_target: number;
  monthly_recurring_revenue_target: number;
  monthly_new_clients_goal: number;
  quarterly_new_clients_goal: number;
  client_retention_goal_pct: number;
  avg_revenue_per_client_target: number;
  service_expansion_goals: any;
  team_growth_target: number;
  market_expansion_goals: any;
  team_size_current: number;
  team_rate_per_hour: number;
}> {
  const jsonbSqlOrEmpty = (raw: string | undefined) => {
    const trimmed = (raw || "").trim();
    if (!trimmed) return "'{}'::jsonb";
    try {
      const parsed = JSON.parse(trimmed);
      const safe = JSON.stringify(parsed).replace(/'/g, "''");
      return `'${safe}'::jsonb`;
    } catch {
      return "'{}'::jsonb";
    }
  };

  const serviceExpansionSql = jsonbSqlOrEmpty(env("CEO_SERVICE_EXPANSION_GOALS_JSON"));
  const marketExpansionSql = jsonbSqlOrEmpty(env("CEO_MARKET_EXPANSION_GOALS_JSON"));

  await db.unsafe(`
    insert into ceo_company_goals (
      id,
      annual_revenue_target,
      monthly_recurring_revenue_target,
      monthly_new_clients_goal,
      quarterly_new_clients_goal,
      client_retention_goal_pct,
      avg_revenue_per_client_target,
      service_expansion_goals,
      team_growth_target,
      market_expansion_goals,
      team_size_current,
      team_rate_per_hour
    )
    values (
      1,
      ${Number(env("CEO_ANNUAL_REVENUE_TARGET") || 0)},
      ${Number(env("CEO_MONTHLY_RECURRING_REVENUE_TARGET") || 0)},
      ${Number(env("CEO_MONTHLY_NEW_CLIENTS_GOAL") || 30)},
      ${Number(env("CEO_QUARTERLY_NEW_CLIENTS_GOAL") || 90)},
      ${Number(env("CEO_CLIENT_RETENTION_GOAL_PCT") || 90)},
      ${Number(env("CEO_AVG_REVENUE_PER_CLIENT_TARGET") || 15000)},
      ${serviceExpansionSql},
      ${Number(env("CEO_TEAM_GROWTH_TARGET") || 0)},
      ${marketExpansionSql},
      ${Number(env("CEO_TEAM_SIZE_CURRENT") || 5)},
      ${Number(env("CEO_TEAM_RATE_PER_HOUR") || 100)}
    )
    on conflict (id) do nothing;
  `);

  const rows = await db<
    Array<{
      annual_revenue_target: number;
      monthly_recurring_revenue_target: number;
      monthly_new_clients_goal: number;
      quarterly_new_clients_goal: number;
      client_retention_goal_pct: number;
      avg_revenue_per_client_target: number;
      service_expansion_goals: any;
      team_growth_target: number;
      market_expansion_goals: any;
      team_size_current: number;
      team_rate_per_hour: number;
    }>
  >`select
      annual_revenue_target,
      monthly_recurring_revenue_target,
      monthly_new_clients_goal,
      quarterly_new_clients_goal,
      client_retention_goal_pct,
      avg_revenue_per_client_target,
      service_expansion_goals,
      team_growth_target,
      market_expansion_goals,
      team_size_current,
      team_rate_per_hour
    from ceo_company_goals
    where id=1`;

  const r = rows[0];
  return {
    annual_revenue_target: Number(r?.annual_revenue_target ?? 0),
    monthly_recurring_revenue_target: Number(r?.monthly_recurring_revenue_target ?? 0),
    monthly_new_clients_goal: Number(r?.monthly_new_clients_goal ?? 30),
    quarterly_new_clients_goal: Number(r?.quarterly_new_clients_goal ?? 90),
    client_retention_goal_pct: Number(r?.client_retention_goal_pct ?? 90),
    avg_revenue_per_client_target: Number(r?.avg_revenue_per_client_target ?? 0),
    service_expansion_goals: r?.service_expansion_goals ?? {},
    team_growth_target: Number(r?.team_growth_target ?? 0),
    market_expansion_goals: r?.market_expansion_goals ?? {},
    team_size_current: Number(r?.team_size_current ?? 5),
    team_rate_per_hour: Number(r?.team_rate_per_hour ?? 100),
  };
}

type SopRecord = {
  id: string;
  parent_sop: string;
  sop_type: string;
  initiative_name: string;
  status: string;
  description: string;
  version: number;
  expected_client_demand_weight: number;
  dev_hours_per_client: number;
  support_hours_per_month_per_client: number;
  third_party_cost_per_client: number;
  third_party_cost_per_month_per_client: number;
  hosting_cost_per_month_per_client: number;
  pricing_one_time: number;
  pricing_mrr: number;
  estimated_client_lifetime_months: number;
  automation_level: number;
  scaling_constraints: string;
};

async function getActiveSops(db: Sql): Promise<SopRecord[]> {
  const rows = await db<
    SopRecord[]
  >`select
      id,
      parent_sop,
      sop_type,
      initiative_name,
      status,
      description,
      version,
      expected_client_demand_weight,
      dev_hours_per_client,
      support_hours_per_month_per_client,
      third_party_cost_per_client,
      third_party_cost_per_month_per_client,
      hosting_cost_per_month_per_client,
      pricing_one_time,
      pricing_mrr,
      estimated_client_lifetime_months,
      automation_level,
      scaling_constraints
    from ceo_sops
    where status='active'
    order by updated_at desc`;
  return rows.map((r: any) => ({
    id: String(r.id),
    parent_sop: String(r.parent_sop ?? ""),
    sop_type: String(r.sop_type ?? ""),
    initiative_name: String(r.initiative_name ?? ""),
    status: String(r.status ?? "active"),
    description: String(r.description ?? ""),
    version: Number(r.version ?? 1),
    expected_client_demand_weight: Number(r.expected_client_demand_weight ?? 1),
    dev_hours_per_client: Number(r.dev_hours_per_client ?? 0),
    support_hours_per_month_per_client: Number(r.support_hours_per_month_per_client ?? 0),
    third_party_cost_per_client: Number(r.third_party_cost_per_client ?? 0),
    third_party_cost_per_month_per_client: Number(r.third_party_cost_per_month_per_client ?? 0),
    hosting_cost_per_month_per_client: Number(r.hosting_cost_per_month_per_client ?? 0),
    pricing_one_time: Number(r.pricing_one_time ?? 0),
    pricing_mrr: Number(r.pricing_mrr ?? 0),
    estimated_client_lifetime_months: Number(r.estimated_client_lifetime_months ?? 12),
    automation_level: Number(r.automation_level ?? 0.3),
    scaling_constraints: String(r.scaling_constraints ?? ""),
  }));
}

function computeUnitEconomics(params: {
  dev_hours_per_client: number;
  support_hours_per_month_per_client: number;
  third_party_cost_per_client: number;
  third_party_cost_per_month_per_client: number;
  hosting_cost_per_month_per_client: number;
  pricing_one_time: number;
  pricing_mrr: number;
  estimated_client_lifetime_months: number;
  team_rate_per_hour: number;
}) {
  const lifetimeMonths = Math.max(1, Math.floor(params.estimated_client_lifetime_months || 12));
  const hourlyRate = Math.max(0, params.team_rate_per_hour || 0);

  const devCost = params.dev_hours_per_client * hourlyRate;
  const initialThirdParty = params.third_party_cost_per_client;
  const initialSetupCost = devCost + initialThirdParty;

  const monthlySupportCost = params.support_hours_per_month_per_client * hourlyRate;
  const monthlyToolsCost = params.third_party_cost_per_month_per_client + params.hosting_cost_per_month_per_client;
  const monthlyCost = monthlySupportCost + monthlyToolsCost;

  const monthlyRevenue = params.pricing_mrr;
  const totalRevenue = params.pricing_one_time + monthlyRevenue * lifetimeMonths;
  const totalCost = initialSetupCost + monthlyCost * lifetimeMonths;
  const grossMargin = totalRevenue - totalCost;
  const grossMarginPct = totalRevenue !== 0 ? grossMargin / totalRevenue : 0;

  const monthlyGrossProfit = monthlyRevenue - monthlyCost; // profit after initial setup
  const paybackMonths =
    monthlyGrossProfit > 0 ? initialSetupCost / monthlyGrossProfit : Number.POSITIVE_INFINITY;
  const breakevenMonths = paybackMonths;

  return {
    lifetimeMonths,
    devCost,
    initialThirdParty,
    initialSetupCost,
    monthlySupportCost,
    monthlyToolsCost,
    monthlyCost,
    monthlyRevenue,
    monthlyGrossProfit,
    totalRevenue,
    totalCost,
    grossMargin,
    grossMarginPct,
    paybackMonths,
    breakevenMonths,
    breakEven: Number.isFinite(breakevenMonths) ? breakevenMonths <= lifetimeMonths : false,
  };
}

function allocateClientDemand(params: { totalClients: number; sops: SopRecord[] }) {
  const demandWeights = params.sops.map((s) => Math.max(0, Number(s.expected_client_demand_weight ?? 1)));
  const sum = demandWeights.reduce((a, b) => a + b, 0) || 1;
  const alloc = params.sops.map((s, i) => {
    const share = demandWeights[i] / sum;
    return { sop: s, allocatedClients: Math.floor(share * params.totalClients) };
  });
  // Fix rounding to match exactly totalClients.
  let used = alloc.reduce((acc, x) => acc + x.allocatedClients, 0);
  let remaining = params.totalClients - used;
  if (remaining > 0) {
    // Add remaining to the top weights.
    const sortedIdx = alloc
      .map((a, idx) => ({ idx, w: demandWeights[idx] }))
      .sort((a, b) => b.w - a.w)
      .map((x) => x.idx);
    for (let i = 0; i < remaining; i++) alloc[sortedIdx[i % sortedIdx.length]].allocatedClients += 1;
  }
  return alloc;
}

function scoreSopVsGoals(params: {
  sop: SopRecord;
  goals: {
    monthly_new_clients_goal: number;
    monthly_recurring_revenue_target: number;
    client_retention_goal_pct: number;
  };
  econ: ReturnType<typeof computeUnitEconomics>;
}) {
  const { sop, goals, econ } = params;

  const newClientLikely = sop.pricing_one_time > 0 || sop.pricing_mrr > 0;
  const profitabilityScore = econ.grossMargin > 0 ? 1 : -1 * Math.min(1, Math.abs(econ.grossMarginPct));
  const paybackScore = econ.paybackMonths <= 12 ? 1 : econ.paybackMonths <= 18 ? 0 : -0.5;
  const scalabilityScore =
    sop.dev_hours_per_client <= 40 ? 1 : sop.dev_hours_per_client <= 80 ? 0.25 : -0.5;

  const demandScore = Math.max(0, Number(sop.expected_client_demand_weight ?? 1));
  const alignmentRaw = profitabilityScore * 0.4 + paybackScore * 0.25 + scalabilityScore * 0.25 + (newClientLikely ? 0.1 : 0);
  const alignmentScore = Math.round((alignmentRaw * 100 + demandScore * 2) * 10) / 10;

  const flags: string[] = [];
  if (econ.grossMargin < 0) flags.push("Negative gross margin at estimated lifetime.");
  if (econ.paybackMonths > 12) flags.push(`Long payback (${Math.round(econ.paybackMonths)} months).`);
  if (econ.monthlyGrossProfit <= 0) flags.push("Monthly gross profit <= 0.");
  if (sop.support_hours_per_month_per_client > 12) flags.push("High ongoing support demand (retention risk + bottleneck).");

  const isAligned =
    econ.grossMargin > 0 && econ.paybackMonths <= 12 && newClientLikely && (sop.automation_level >= 0.2 || sop.dev_hours_per_client <= 60);

  return {
    alignmentScore,
    isAligned,
    highlights: {
      contributes_to_new_clients: newClientLikely,
      contributes_to_mrr: sop.pricing_mrr > 0,
      scales_well: sop.dev_hours_per_client <= 80 && sop.support_hours_per_month_per_client <= 12,
    },
    flags,
  };
}

async function upsertKpiLinks(db: Sql, input: { sopId: string; kpiLinks: Array<{ kpiId: string; weight: number }> }) {
  for (const link of input.kpiLinks) {
    await db.unsafe(
      `insert into ceo_sop_kpi_links (id, sop_id, kpi_id, weight)
       values (${JSON.stringify(`link_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`)}, ${JSON.stringify(input.sopId)}, ${JSON.stringify(
        link.kpiId,
      )}, ${link.weight})
       on conflict (sop_id,kpi_id) do update set weight=excluded.weight`
    );
  }
}

async function ensureDefaultKpis(db: Sql) {
  // Minimal baseline set; tools can still work without performance telemetry.
  const defaults: Array<{ id: string; name: string; description: string; unit: string; targetValue?: number }> = [
    { id: "kpi_new_clients_month", name: "New clients (month)", description: "Client activations in the month window.", unit: "clients" },
    { id: "kpi_mrr", name: "MRR (monthly recurring revenue)", description: "Monthly recurring revenue from activated + upsell accepted events.", unit: "usd" },
    { id: "kpi_arpc", name: "ARPC (avg revenue per client)", description: "Monthly revenue divided by revenue-bearing clients.", unit: "usd" },
    { id: "kpi_retention", name: "Retention", description: "Estimated from churn events / active clients.", unit: "pct" },
    { id: "kpi_gross_margin", name: "Gross margin", description: "Lifetime gross margin from estimated unit economics.", unit: "usd" },
    { id: "kpi_nps", name: "NPS", description: "Net Promoter Score (SOP-specific performance).", unit: "score" },
    { id: "kpi_churn_rate", name: "Churn rate", description: "SOP-specific churn estimate.", unit: "pct" },
  ];

  for (const k of defaults) {
    await db.unsafe(`
      insert into ceo_kpis (id, name, description, unit, target_value)
      values (${JSON.stringify(k.id)}, ${JSON.stringify(k.name)}, ${JSON.stringify(k.description)}, ${JSON.stringify(k.unit)}, ${
      typeof k.targetValue === "number" ? k.targetValue : "null"
    })
      on conflict (id) do nothing
    `);
  }
}

const TrackGoalProgressInput = z.object({
  month_start_iso: z.string().optional(),
  month_end_iso: z.string().optional(),
  new_clients_goal_override: z.number().int().optional(),
  send_telegram: z.boolean().optional().default(false),
  telegram_chat_id: z.string().optional(),
  telegram_bot_token: z.string().optional(),
  store_to_db: z.boolean().optional().default(true),
});

async function sendTelegram(message: string, params: { chat_id?: string; bot_token?: string }) {
  const token = (params.bot_token || env("TELEGRAM_BOT_TOKEN")).trim();
  const chatId = (params.chat_id || env("TELEGRAM_CHAT_ID")).trim();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required (or pass telegram_bot_token).");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is required (or pass telegram_chat_id).");
  const res = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status} ${txt}`);
  return txt;
}

function formatExecutiveBriefing(params: {
  progress: {
    new_clients_goal: number;
    new_clients_actual: number;
    new_clients_progress_pct: number | null;
    mrr_target: number;
    mrr_actual: number;
    mrr_progress_pct: number | null;
    retention_goal_pct: number;
    retention_actual_pct: number | null;
  };
  sopRanking: Array<{
    sopId: string;
    initiative_name: string;
    grossMargin: number;
    grossMarginPct: number;
    paybackMonths: number;
    dev_hours_per_client: number;
    support_hours_per_month_per_client: number;
    allocationClients: number;
    riskFlags: string[];
  }>;
  bottlenecks: Array<{ sopId: string; title: string; details: string }>;
  opportunities: Array<{ title: string; details: string; sopType?: string }>;
  hiringNeed: { neededTeamSize: number; delta: number };
  actionItems: string[];
  notes?: string[];
}) {
  const p = params.progress;
  const progClients = p.new_clients_progress_pct == null ? "—" : `${Math.round(p.new_clients_progress_pct)}%`;
  const progMrr = p.mrr_progress_pct == null ? "—" : `${Math.round(p.mrr_progress_pct)}%`;
  const retention = p.retention_actual_pct == null ? "—" : `${Math.round(p.retention_actual_pct)}%`;

  const topProfit = params.sopRanking
    .slice()
    .sort((a, b) => b.grossMargin - a.grossMargin)
    .slice(0, 3);
  const losing = params.sopRanking
    .slice()
    .filter((s) => s.grossMargin < 0)
    .sort((a, b) => a.grossMargin - b.grossMargin)
    .slice(0, 2);

  const lines: string[] = [];
  lines.push("📊 CEO COACH BRIEFING");
  lines.push(
    `🎯 Goal Progress: ${p.new_clients_actual} / ${p.new_clients_goal} new clients this month (${progClients}) • MRR ${fmtMoney(
      p.mrr_actual,
    )} / ${fmtMoney(p.mrr_target)} (${progMrr}) • Retention ${retention} (goal ${Math.round(p.retention_goal_pct)}%)`,
  );
  lines.push("");

  if (params.bottlenecks.length) {
    lines.push("⚠️ Bottlenecks");
    for (const b of params.bottlenecks.slice(0, 3)) lines.push(`- ${b.title}: ${b.details}`);
    lines.push("");
  }

  if (topProfit.length) {
    lines.push("💰 Top SOP Profitability");
    for (const s of topProfit) {
      const gm = `${fmtMoney(s.grossMargin)} (${safePct(s.grossMarginPct * 100)})`;
      const pb = Number.isFinite(s.paybackMonths) ? `${Math.round(s.paybackMonths)} mo` : "∞";
      lines.push(`- ${s.initiative_name}: ${gm}, payback ${pb}, allocated ${s.allocationClients}`);
    }
    lines.push("");
  }

  if (losing.length) {
    lines.push("🔴 Unprofitable / Risky SOPs");
    for (const s of losing) {
      const pb = Number.isFinite(s.paybackMonths) ? `${Math.round(s.paybackMonths)} mo` : "∞";
      lines.push(`- ${s.initiative_name}: GM ${fmtMoney(s.grossMargin)}, payback ${pb} (dev ${Math.round(s.dev_hours_per_client)}h/client)`);
      if (s.riskFlags.length) lines.push(`  - Flags: ${s.riskFlags.slice(0, 2).join(" | ")}`);
    }
    lines.push("");
  }

  if (params.opportunities.length) {
    lines.push("💡 Opportunities (New SOP Initiatives)");
    for (const o of params.opportunities.slice(0, 4)) lines.push(`- ${o.title}: ${o.details}`);
    lines.push("");
  }

  lines.push(`👥 Hiring need: estimated team size ${params.hiringNeed.neededTeamSize} (delta ${params.hiringNeed.delta >= 0 ? "+" : ""}${params.hiringNeed.delta}).`);
  lines.push("");

  lines.push("✅ Action Items for Today");
  for (const a of params.actionItems.slice(0, 6)) lines.push(`- ${a}`);
  if (params.notes?.length) {
    lines.push("");
    lines.push("Notes");
    for (const n of params.notes.slice(0, 3)) lines.push(`- ${n}`);
  }

  return lines.join("\n").trim();
}

async function buildSopPerformance(params: {
  db: Sql;
  goals: Awaited<ReturnType<typeof ensureGoalsRow>>;
  sops: SopRecord[];
  totalClientsToAllocate: number;
}) {
  const { goals, sops } = params;
  const allocated = allocateClientDemand({ totalClients: params.totalClientsToAllocate, sops });

  const sopRanking = allocated.map(({ sop, allocatedClients }) => {
    const econ = computeUnitEconomics({
      dev_hours_per_client: sop.dev_hours_per_client,
      support_hours_per_month_per_client: sop.support_hours_per_month_per_client,
      third_party_cost_per_client: sop.third_party_cost_per_client,
      third_party_cost_per_month_per_client: sop.third_party_cost_per_month_per_client,
      hosting_cost_per_month_per_client: sop.hosting_cost_per_month_per_client,
      pricing_one_time: sop.pricing_one_time,
      pricing_mrr: sop.pricing_mrr,
      estimated_client_lifetime_months: sop.estimated_client_lifetime_months,
      team_rate_per_hour: goals.team_rate_per_hour,
    });

    const scoring = scoreSopVsGoals({
      sop,
      goals: {
        monthly_new_clients_goal: goals.monthly_new_clients_goal,
        monthly_recurring_revenue_target: goals.monthly_recurring_revenue_target,
        client_retention_goal_pct: goals.client_retention_goal_pct,
      },
      econ,
    });

    return {
      sopId: sop.id,
      initiative_name: sop.initiative_name,
      sopType: sop.sop_type,
      grossMargin: econ.grossMargin,
      grossMarginPct: econ.grossMarginPct,
      paybackMonths: econ.paybackMonths,
      dev_hours_per_client: sop.dev_hours_per_client,
      support_hours_per_month_per_client: sop.support_hours_per_month_per_client,
      allocationClients: allocatedClients,
      riskFlags: scoring.flags,
      alignmentScore: scoring.alignmentScore,
      isAligned: scoring.isAligned,
      unitEconomics: econ,
    };
  });

  return { sopRanking, allocation: allocated, totalClientsToAllocate: params.totalClientsToAllocate };
}

async function computeCapacityAndHiring(params: {
  goals: Awaited<ReturnType<typeof ensureGoalsRow>>;
  sops: SopRecord[];
  totalClientsToAllocate: number;
}) {
  const { goals, sops } = params;
  const perPersonHoursPerMonth = 160; // conservative default
  const teamHours = goals.team_size_current * perPersonHoursPerMonth;

  // We treat dev_hours_per_client as “build effort” that consumes team hours this month.
  const allocated = allocateClientDemand({ totalClients: params.totalClientsToAllocate, sops });
  const devHoursNeeded = allocated.reduce(
    (acc, a) => acc + a.allocatedClients * (a.sop.dev_hours_per_client || 0),
    0,
  );
  const supportHoursNeeded = allocated.reduce(
    (acc, a) => acc + a.allocatedClients * (a.sop.support_hours_per_month_per_client || 0),
    0,
  );

  // Simple model: 70% of teamHours for dev build tasks, 30% for ongoing support.
  const devBudget = teamHours * 0.7;
  const supportBudget = teamHours * 0.3;
  const devOk = devHoursNeeded <= devBudget;
  const supportOk = supportHoursNeeded <= supportBudget;

  const neededDevTeamSize = devBudget > 0 ? Math.ceil(devHoursNeeded / (perPersonHoursPerMonth * 0.7)) : Math.ceil(devHoursNeeded / (perPersonHoursPerMonth * 0.7));
  const neededSupportTeamSize =
    supportBudget > 0 ? Math.ceil(supportHoursNeeded / (perPersonHoursPerMonth * 0.3)) : Math.ceil(supportHoursNeeded / (perPersonHoursPerMonth * 0.3));

  const neededTeamSize = Math.max(1, neededDevTeamSize, neededSupportTeamSize);
  const delta = neededTeamSize - goals.team_size_current;

  const maxClientsDev = devBudget / (sops.length ? Math.max(1, Math.min(...sops.map((s) => s.dev_hours_per_client || 1))) : 1);
  const notes = [
    `Dev budget ${Math.round(devBudget)}h vs needed ${Math.round(devHoursNeeded)}h`,
    `Support budget ${Math.round(supportBudget)}h vs needed ${Math.round(supportHoursNeeded)}h`,
  ];

  return {
    devOk,
    supportOk,
    devHoursNeeded,
    supportHoursNeeded,
    neededTeamSize,
    delta,
    notes,
    maxClientsDev,
  };
}

async function execAnalyzeSopAgainstGoals(params: {
  sop: SopRecord;
  goals: Awaited<ReturnType<typeof ensureGoalsRow>>;
}) {
  const econ = computeUnitEconomics({
    dev_hours_per_client: params.sop.dev_hours_per_client,
    support_hours_per_month_per_client: params.sop.support_hours_per_month_per_client,
    third_party_cost_per_client: params.sop.third_party_cost_per_client,
    third_party_cost_per_month_per_client: params.sop.third_party_cost_per_month_per_client,
    hosting_cost_per_month_per_client: params.sop.hosting_cost_per_month_per_client,
    pricing_one_time: params.sop.pricing_one_time,
    pricing_mrr: params.sop.pricing_mrr,
    estimated_client_lifetime_months: params.sop.estimated_client_lifetime_months,
    team_rate_per_hour: params.goals.team_rate_per_hour,
  });

  const scoring = scoreSopVsGoals({
    sop: params.sop,
    goals: {
      monthly_new_clients_goal: params.goals.monthly_new_clients_goal,
      monthly_recurring_revenue_target: params.goals.monthly_recurring_revenue_target,
      client_retention_goal_pct: params.goals.client_retention_goal_pct,
    },
    econ,
  });

  return { econ, ...scoring };
}

const AnalyzeSopAgainstGoalsInput = z.object({
  sop: z.object({
    id: z.string(),
    parent_sop: z.string().optional(),
    sop_type: z.string().optional(),
    initiative_name: z.string(),
    status: z.string().optional(),
    description: z.string().optional(),
    version: z.number().optional(),
    expected_client_demand_weight: z.number().optional(),
    dev_hours_per_client: z.number().optional(),
    support_hours_per_month_per_client: z.number().optional(),
    third_party_cost_per_client: z.number().optional(),
    third_party_cost_per_month_per_client: z.number().optional(),
    hosting_cost_per_month_per_client: z.number().optional(),
    pricing_one_time: z.number().optional(),
    pricing_mrr: z.number().optional(),
    estimated_client_lifetime_months: z.number().optional(),
    automation_level: z.number().optional(),
    scaling_constraints: z.string().optional(),
  }),
  goals: z.object({
    monthly_new_clients_goal: z.number().optional(),
    monthly_recurring_revenue_target: z.number().optional(),
    client_retention_goal_pct: z.number().optional(),
    team_rate_per_hour: z.number().optional(),
  }),
});

const IdentifyScalingGapsInput = z.object({
  sop: z.object({
    dev_hours_per_client: z.number(),
    support_hours_per_month_per_client: z.number(),
    estimated_client_lifetime_months: z.number().optional(),
    pricing_mrr: z.number().optional(),
    automation_level: z.number().optional(),
  }),
  team_size_current: z.number().int().positive().default(5),
  team_rate_per_hour: z.number().default(100),
  target_clients_simultaneously: z.number().int().default(10),
  target_clients_simultaneously_hi: z.number().int().default(50),
});

const RecommendNewSopsInput = z.object({
  scaling_gaps: z.array(z.any()).optional(),
  top_risks: z.array(z.any()).optional(),
  goal_new_clients_per_month: z.number().int().default(30),
});

const GenerateStrategicSopInput = z.object({
  initiative_name: z.string().min(3),
  business_goal_it_supports: z.string().min(3),
  why_we_need_this_sop: z.string().min(3),
  how_it_supports_company_goals: z.string().min(3),
  agents_required: z.array(z.string()).min(1),
  tech_stack: z.string().min(3),
  timeline: z.string().min(3),
  cost_to_deliver_estimate: z.string().min(1).optional(),
  revenue_pricing_and_profitability: z.string().min(1).optional(),
  scaling_capacity_estimate: z.string().min(1).optional(),
  differentiation: z.string().min(1).optional(),
  risk_assessment: z.string().min(1).optional(),
  success_metrics: z.array(z.string()).min(1),
  sop_type: z.string().optional(),
  parent_sop: z.string().optional(),
  persist_to_db: z.boolean().optional().default(false),
  sop_id: z.string().optional(),
});

const LinkSopsToKpisInput = z.object({
  sop_ids: z.array(z.string()).optional(),
  link_strength_default: z.number().default(1),
  persist_to_db: z.boolean().optional().default(true),
});

const CreateSopHierarchyInput = z.object({
  status: z.enum(["active", "all"]).optional().default("active"),
});

const SuggestProcessImprovementsInput = z.object({
  sops: z.array(z.any()).optional(),
});

const server = new Server({ name: "ceo-coach", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze-sop-against-goals",
        description: "Score a SOP against business goals + unit economics (profitability + payback + scalability).",
        inputSchema: zodToJsonSchema(AnalyzeSopAgainstGoalsInput),
      },
      {
        name: "identify-scaling-gaps",
        description: "Estimate whether a SOP can be delivered to N clients concurrently and identify scaling bottlenecks.",
        inputSchema: zodToJsonSchema(IdentifyScalingGapsInput),
      },
      {
        name: "recommend-new-sops",
        description: "Recommend new SOP initiatives based on scaling gaps and profitability risks.",
        inputSchema: zodToJsonSchema(RecommendNewSopsInput),
      },
      {
        name: "generate-strategic-sop",
        description: "Generate a structured SOP for a new initiative (returns a Notion payload + DB insert payload).",
        inputSchema: zodToJsonSchema(GenerateStrategicSopInput),
      },
      {
        name: "link-sops-to-kpis",
        description: "Create SOP→KPI mapping (and optionally persist into DB).",
        inputSchema: zodToJsonSchema(LinkSopsToKpisInput),
      },
      {
        name: "create-sop-hierarchy",
        description: "Return a hierarchical SOP tree suitable for rendering as a Figma diagram (nodes + edges).",
        inputSchema: zodToJsonSchema(CreateSopHierarchyInput),
      },
      {
        name: "track-goal-progress",
        description: "Compute monthly goal progress, SOP capacity/profitability, and generate an executive CEO briefing.",
        inputSchema: zodToJsonSchema(TrackGoalProgressInput),
      },
      {
        name: "suggest-process-improvements",
        description: "Suggest process improvements (automation, scope reduction, bundling, hiring) for SOPs.",
        inputSchema: zodToJsonSchema(SuggestProcessImprovementsInput),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
  const name: string = req.params?.name;
  const args = (req.params?.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  const db = await getDb();
  try {
    await ensureCeoCoachTables(db);
    await ensureAnalyticsTables(db).catch(() => {});

    if (name === "track-goal-progress") {
      const parsed = TrackGoalProgressInput.parse(obj);
      const window = monthWindowUtc({ month_start_iso: parsed.month_start_iso, month_end_iso: parsed.month_end_iso });

      const goals = await ensureGoalsRow(db);
      const monthStart = isoDate(window.since);
      const monthEnd = isoDate(window.until);

      const newClientsGoal = parsed.new_clients_goal_override ?? goals.monthly_new_clients_goal ?? 30;

      const actualNewClientsRows = await db<
        Array<{ active_clients: number }>
      >`select count(distinct client_id)::int as active_clients
        from public.events
        where event_type='client_activated'
          and timestamp >= ${window.since.toISOString()}::timestamptz
          and timestamp < ${window.until.toISOString()}::timestamptz`;

      const newClientsActual = Number(actualNewClientsRows[0]?.active_clients ?? 0);

      const metricsRange: DateRange = { start_date: isoDate(window.since), end_date: isoDate(window.until) };
      const metrics = await calculateBusinessMetrics(db, metricsRange);

      const mrrActual = Number(metrics?.metrics?.monthly_recurring_revenue ?? 0);
      const arpc = Number(metrics?.metrics?.average_revenue_per_client ?? 0);
      const churnRate = Number(metrics?.metrics?.churn_rate ?? 0);
      const retentionActualPct = (1 - churnRate) * 100;

      const mrrTarget = Number(goals.monthly_recurring_revenue_target ?? 0);
      const mrrProgressPct = mrrTarget > 0 ? (mrrActual / mrrTarget) * 100 : null;
      const newClientsProgressPct = newClientsGoal > 0 ? (newClientsActual / newClientsGoal) * 100 : null;

      const sops = await getActiveSops(db);
      const totalClientsToAllocate = newClientsGoal > 0 ? newClientsGoal : 30;

      const { sopRanking } = await buildSopPerformance({
        db,
        goals,
        sops,
        totalClientsToAllocate,
      });

      const capacity = await computeCapacityAndHiring({ goals, sops, totalClientsToAllocate });

      const bottlenecks: Array<{ sopId: string; title: string; details: string }> = [];
      if (!sops.length) {
        bottlenecks.push({
          sopId: "none",
          title: "No active SOPs found",
          details: "Create at least one SOP record in `ceo_sops` (or via `generate-strategic-sop` with `persist_to_db`).",
        });
      } else {
        const sortedByDev = sopRanking.slice().sort((a, b) => b.dev_hours_per_client - a.dev_hours_per_client);
        const sortedBySupport = sopRanking.slice().sort((a, b) => b.support_hours_per_month_per_client - a.support_hours_per_month_per_client);
        const topDev = sortedByDev[0];
        const topSupport = sortedBySupport[0];
        if (topDev && topDev.dev_hours_per_client > 60) {
          bottlenecks.push({
            sopId: topDev.sopId,
            title: "High build effort",
            details: `~${Math.round(topDev.dev_hours_per_client)}h development per client; automation/templates likely needed.`,
          });
        }
        if (topSupport && topSupport.support_hours_per_month_per_client > 10) {
          bottlenecks.push({
            sopId: topSupport.sopId,
            title: "High ongoing support effort",
            details: `~${Math.round(topSupport.support_hours_per_month_per_client)}h support per month per client; scope control or support automation needed.`,
          });
        }
        if (!capacity.devOk || !capacity.supportOk) {
          bottlenecks.push({
            sopId: "team-capacity",
            title: "Team capacity constraint",
            details: `Estimated needed team size ${capacity.neededTeamSize} (delta ${capacity.delta >= 0 ? "+" : ""}${capacity.delta}).`,
          });
        }
      }

      // Opportunities: prioritize new SOPs that reduce dev/support hours or increase pricing.
      const unprofitable = sopRanking.filter((s) => s.grossMargin < 0).sort((a, b) => a.grossMargin - b.grossMargin);
      const highestDev = sopRanking.slice().sort((a, b) => b.dev_hours_per_client - a.dev_hours_per_client);
      const highestSupport = sopRanking.slice().sort((a, b) => b.support_hours_per_month_per_client - a.support_hours_per_month_per_client);

      const opportunities: Array<{ title: string; details: string; sopType?: string }> = [];
      if (highestDev[0]) {
        opportunities.push({
          title: `Fast-Track Variant: ${highestDev[0].initiative_name}`,
          details: "Compress build effort by standardizing scope and automating delivery steps; target <40h development per client.",
          sopType: highestDev[0].sopType,
        });
      }
      if (highestSupport[0] && highestSupport[0].support_hours_per_month_per_client > 10) {
        opportunities.push({
          title: `Low-Touch Support Tier: ${highestSupport[0].initiative_name}`,
          details: "Shift from manual support to templates + async check-ins; target <6h/month support per client.",
          sopType: highestSupport[0].sopType,
        });
      }
      if (unprofitable[0]) {
        opportunities.push({
          title: `Scope/LTV Rescue Plan for ${unprofitable[0].initiative_name}`,
          details: "Reduce variable cost drivers and/or raise prices. Add a minimum-lifetime package to improve payback <12 months.",
          sopType: unprofitable[0].sopType,
        });
      }

      const hiringNeed = { neededTeamSize: capacity.neededTeamSize, delta: capacity.delta };

      const actionItems: string[] = [];
      if (bottlenecks.length) actionItems.push(`Address bottleneck: ${bottlenecks[0].title}.`);
      actionItems.push("Pick 1–2 SOPs to standardize this week (reduce dev hours + support hours).");
      actionItems.push("Update SOP pricing assumptions where payback exceeds 12 months.");
      actionItems.push("Create at least one new 'Fast-Track' SOP iteration for the highest-dev bottleneck.");
      if (capacity.delta > 0) actionItems.push(`Prepare to hire/contract ~${capacity.delta} additional team member(s) for this month’s delivery load.`);
      if (unprofitable.length) actionItems.push("Raise prices or reduce scope for SOPs with negative gross margin.");
      // Keep action items actionable and non-redundant.
      const uniqueActionItems = Array.from(new Set(actionItems)).slice(0, 6);

      const briefingText = formatExecutiveBriefing({
        progress: {
          new_clients_goal: newClientsGoal,
          new_clients_actual: newClientsActual,
          new_clients_progress_pct: newClientsProgressPct,
          mrr_target: mrrTarget,
          mrr_actual: mrrActual,
          mrr_progress_pct: mrrProgressPct,
          retention_goal_pct: goals.client_retention_goal_pct ?? 0,
          retention_actual_pct: Number.isFinite(retentionActualPct) ? retentionActualPct : null,
        },
        sopRanking: sopRanking.map((s) => ({
          sopId: s.sopId,
          initiative_name: s.initiative_name,
          grossMargin: s.grossMargin,
          grossMarginPct: s.grossMarginPct,
          paybackMonths: s.paybackMonths,
          dev_hours_per_client: s.dev_hours_per_client,
          support_hours_per_month_per_client: s.support_hours_per_month_per_client,
          allocationClients: s.allocationClients,
          riskFlags: s.riskFlags,
        })),
        bottlenecks,
        opportunities,
        hiringNeed,
        actionItems: uniqueActionItems,
        notes: [
          `Assumptions: team capacity model splits dev/support 70/30, 160h/person/month.`,
          `MRR + ARPC come from event metadata (client_activated + upsell_accepted).`,
          `Unit economics come from ` + (sops.length ? "ceo_sops fields" : "`ceo_sops` is empty; create records first."),
        ],
      });

      const outJson = {
        ok: true,
        month: { start: monthStart, end: monthEnd },
        goals: {
          annual_revenue_target: goals.annual_revenue_target,
          monthly_recurring_revenue_target: goals.monthly_recurring_revenue_target,
          monthly_new_clients_goal: goals.monthly_new_clients_goal,
          client_retention_goal_pct: goals.client_retention_goal_pct,
        },
        actuals: {
          new_clients_actual: newClientsActual,
          mrr_actual: mrrActual,
          arpc,
          retention_actual_pct: Number.isFinite(retentionActualPct) ? retentionActualPct : null,
        },
        sopPerformance: sopRanking,
        capacity,
        opportunities,
        actionItems: uniqueActionItems,
        briefingText,
      };

      if (parsed.send_telegram) {
        await sendTelegram(briefingText, { chat_id: parsed.telegram_chat_id, bot_token: parsed.telegram_bot_token });
      }

      if (parsed.store_to_db) {
        const id = `ceo_brief_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        await db.unsafe(
          `insert into ceo_coach_briefings (id, briefing_date, month_start, month_end, briefing_text, briefing_json)
           values (${JSON.stringify(id)}, ${JSON.stringify(isoDate(new Date()))}, ${JSON.stringify(monthStart)}, ${JSON.stringify(monthEnd)}, ${JSON.stringify(
            briefingText,
          )}, ${JSON.stringify(outJson)}::jsonb)`
        );
      }

      return { content: [{ type: "text", text: JSON.stringify(outJson, null, 2) }] };
    }

    if (name === "analyze-sop-against-goals") {
      const parsed = AnalyzeSopAgainstGoalsInput.parse(obj);
      const sop = parsed.sop as any;
      const goals = parsed.goals as any;
      const econ = computeUnitEconomics({
        dev_hours_per_client: Number(sop.dev_hours_per_client ?? 0),
        support_hours_per_month_per_client: Number(sop.support_hours_per_month_per_client ?? 0),
        third_party_cost_per_client: Number(sop.third_party_cost_per_client ?? 0),
        third_party_cost_per_month_per_client: Number(sop.third_party_cost_per_month_per_client ?? 0),
        hosting_cost_per_month_per_client: Number(sop.hosting_cost_per_month_per_client ?? 0),
        pricing_one_time: Number(sop.pricing_one_time ?? 0),
        pricing_mrr: Number(sop.pricing_mrr ?? 0),
        estimated_client_lifetime_months: Number(sop.estimated_client_lifetime_months ?? 12),
        team_rate_per_hour: Number(goals.team_rate_per_hour ?? 100),
      });

      const scoring = scoreSopVsGoals({
        sop: {
          id: String(sop.id),
          parent_sop: String(sop.parent_sop ?? ""),
          sop_type: String(sop.sop_type ?? ""),
          initiative_name: String(sop.initiative_name),
          status: String(sop.status ?? "active"),
          description: String(sop.description ?? ""),
          version: Number(sop.version ?? 1),
          expected_client_demand_weight: Number(sop.expected_client_demand_weight ?? 1),
          dev_hours_per_client: Number(sop.dev_hours_per_client ?? 0),
          support_hours_per_month_per_client: Number(sop.support_hours_per_month_per_client ?? 0),
          third_party_cost_per_client: Number(sop.third_party_cost_per_client ?? 0),
          third_party_cost_per_month_per_client: Number(sop.third_party_cost_per_month_per_client ?? 0),
          hosting_cost_per_month_per_client: Number(sop.hosting_cost_per_month_per_client ?? 0),
          pricing_one_time: Number(sop.pricing_one_time ?? 0),
          pricing_mrr: Number(sop.pricing_mrr ?? 0),
          estimated_client_lifetime_months: Number(sop.estimated_client_lifetime_months ?? 12),
          automation_level: Number(sop.automation_level ?? 0.3),
          scaling_constraints: String(sop.scaling_constraints ?? ""),
        },
        goals: {
          monthly_new_clients_goal: Number(goals.monthly_new_clients_goal ?? 30),
          monthly_recurring_revenue_target: Number(goals.monthly_recurring_revenue_target ?? 0),
          client_retention_goal_pct: Number(goals.client_retention_goal_pct ?? 90),
        },
        econ,
      });

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, ...scoring, econ }, null, 2) }] };
    }

    if (name === "identify-scaling-gaps") {
      const parsed = IdentifyScalingGapsInput.parse(obj);
      const perPersonHoursPerMonth = 160;
      const teamHours = parsed.team_size_current * perPersonHoursPerMonth;
      const devBudget = teamHours * 0.7;
      const supportBudget = teamHours * 0.3;

      const devPerClient = Math.max(0, parsed.sop.dev_hours_per_client ?? 0);
      const supportPerClient = Math.max(0, parsed.sop.support_hours_per_month_per_client ?? 0);

      const devNeeded10 = devPerClient * parsed.target_clients_simultaneously;
      const supportNeeded10 = supportPerClient * parsed.target_clients_simultaneously;
      const devNeeded50 = devPerClient * parsed.target_clients_simultaneously_hi;
      const supportNeeded50 = supportPerClient * parsed.target_clients_simultaneously_hi;

      const canScaleTo10 = devNeeded10 <= devBudget && supportNeeded10 <= supportBudget;
      const canScaleTo50 = devNeeded50 <= devBudget && supportNeeded50 <= supportBudget;

      const bottlenecks: string[] = [];
      if (devPerClient > 80) bottlenecks.push("Development hours per client are too high; standardize scope and automate delivery steps.");
      if (supportPerClient > 12) bottlenecks.push("Ongoing support per client is too high; implement low-touch tier and async workflows.");
      if ((parsed.sop.automation_level ?? 0.3) < 0.2) bottlenecks.push("Automation level is low; invest in templates/tooling to raise automation_level.");
      if (!bottlenecks.length && !canScaleTo50) bottlenecks.push("Capacity mismatch; model likely needs more parallelism or hiring.");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                ok: true,
                team: { team_size_current: parsed.team_size_current, teamHours, devBudget, supportBudget },
                sop: { devPerClient, supportPerClient, automation_level: parsed.sop.automation_level ?? 0.3 },
                targets: { to10: parsed.target_clients_simultaneously, to50: parsed.target_clients_simultaneously_hi },
                scaling: {
                  canScaleTo10,
                  canScaleTo50,
                  devNeeded10,
                  supportNeeded10,
                  devNeeded50,
                  supportNeeded50,
                },
                bottlenecks,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    if (name === "recommend-new-sops") {
      const parsed = RecommendNewSopsInput.parse(obj);

      const opportunities: Array<{ initiative_name: string; sop_type?: string; parent_sop?: string; why: string; how: string; expected_outcome: string; success_metrics: string[] }> =
        [];

      // Conservative heuristics: always propose a fast-track variant + low-touch tier if scaling gaps exist.
      opportunities.push({
        initiative_name: "Fast-Track Delivery Variant",
        parent_sop: "Service Delivery",
        sop_type: "Fast-Track Tier",
        why: "Reduce per-client development time so we can handle higher acquisition volumes without adding proportional headcount.",
        how: "Create a standardized template pack, automation for content ingestion, and a shorter review/approval loop.",
        expected_outcome: `Support delivering ${parsed.goal_new_clients_per_month} new clients/month with reduced bottleneck risk.`,
        success_metrics: ["Median dev hours/client drops", "Payback period improves", "On-time delivery rate increases"],
      });
      opportunities.push({
        initiative_name: "Low-Touch Support Tier",
        parent_sop: "Customer Success",
        sop_type: "Low-Touch Tier",
        why: "Lower ongoing support effort while preserving retention and satisfaction targets.",
        how: "Move to async updates, reusable SOP templates, and tiered support SLAs with self-serve resources.",
        expected_outcome: "Improve gross margin by reducing support-hours per client.",
        success_metrics: ["Support hours/client/month drops", "Retention stays above goal", "Satisfaction/NPS remains stable"],
      });

      if (Array.isArray(parsed.top_risks) && parsed.top_risks.length) {
        opportunities.push({
          initiative_name: "Profit Rescue SOP (Pricing/Scope Reset)",
          parent_sop: "Profitability",
          sop_type: "Rescue Plan",
          why: "Address SOPs with negative gross margin or long payback periods so we stop bleeding on new clients.",
          how: "Re-scope deliverables, set minimum lifetime commitments, and adjust pricing to protect target payback windows.",
          expected_outcome: "Eliminate negative gross-margin outcomes for new client cohorts.",
          success_metrics: ["Gross margin becomes positive", "Payback < 12 months", "Churn risk decreases"],
        });
      }

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, opportunities }, null, 2) }] };
    }

    if (name === "generate-strategic-sop") {
      const parsed = GenerateStrategicSopInput.parse(obj);
      const sopId = parsed.sop_id ?? `sop_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

      // Notion payload is a "best effort" JSON structure; the repo doesn’t contain a Notion API client.
      const notionPayload = {
        parent_page_label: "SOP Library",
        title: parsed.initiative_name,
        label: parsed.parent_sop ? `NEW INITIATIVE — ${parsed.initiative_name}` : `NEW INITIATIVE — ${parsed.initiative_name}`,
        properties: {
          "Business goal it supports": parsed.business_goal_it_supports,
          "Why we need this SOP": parsed.why_we_need_this_sop,
          "How it supports company goals": parsed.how_it_supports_company_goals,
          "Agents required": parsed.agents_required,
          "Tech stack": parsed.tech_stack,
          "Timeline": parsed.timeline,
          "Cost to deliver (estimate)": parsed.cost_to_deliver_estimate ?? null,
          "Revenue / pricing / profitability": parsed.revenue_pricing_and_profitability ?? null,
          "Scaling capacity (estimate)": parsed.scaling_capacity_estimate ?? null,
          "Differentiation": parsed.differentiation ?? null,
          "Risk assessment": parsed.risk_assessment ?? null,
          "Success metrics": parsed.success_metrics,
          "SOP id": sopId,
          "SOP version": 1,
        },
        tags: ["new initiative", parsed.sop_type ?? "initiative"],
        created_at_iso: new Date().toISOString(),
      };

      const dbInsert = {
        id: sopId,
        parent_sop: parsed.parent_sop ?? "Service Delivery",
        sop_type: parsed.sop_type ?? "New Initiative",
        initiative_name: parsed.initiative_name,
        status: "active",
        description: parsed.why_we_need_this_sop,
        version: 1,
        expected_client_demand_weight: 1,
        dev_hours_per_client: 60,
        support_hours_per_month_per_client: 6,
        third_party_cost_per_client: 500,
        third_party_cost_per_month_per_client: 100,
        hosting_cost_per_month_per_client: 50,
        pricing_one_time: 5000,
        pricing_mrr: 1500,
        estimated_client_lifetime_months: 12,
        automation_level: 0.5,
        scaling_constraints: "",
      };

      if (parsed.persist_to_db) {
        // Store a baseline SOP record so capacity/profitability can be computed immediately.
        await db.unsafe(`
          insert into ceo_sops (
            id,parent_sop,sop_type,initiative_name,status,description,version,expected_client_demand_weight,
            dev_hours_per_client,support_hours_per_month_per_client,
            third_party_cost_per_client,third_party_cost_per_month_per_client,hosting_cost_per_month_per_client,
            pricing_one_time,pricing_mrr,estimated_client_lifetime_months,automation_level,scaling_constraints
          )
          values (
            ${JSON.stringify(dbInsert.id)},
            ${JSON.stringify(dbInsert.parent_sop)},
            ${JSON.stringify(dbInsert.sop_type)},
            ${JSON.stringify(dbInsert.initiative_name)},
            ${JSON.stringify(dbInsert.status)},
            ${JSON.stringify(dbInsert.description)},
            ${dbInsert.version},
            ${dbInsert.expected_client_demand_weight},
            ${dbInsert.dev_hours_per_client},
            ${dbInsert.support_hours_per_month_per_client},
            ${dbInsert.third_party_cost_per_client},
            ${dbInsert.third_party_cost_per_month_per_client},
            ${dbInsert.hosting_cost_per_month_per_client},
            ${dbInsert.pricing_one_time},
            ${dbInsert.pricing_mrr},
            ${dbInsert.estimated_client_lifetime_months},
            ${dbInsert.automation_level},
            ${JSON.stringify(dbInsert.scaling_constraints)}
          )
          on conflict (id) do update set
            parent_sop=excluded.parent_sop,
            sop_type=excluded.sop_type,
            initiative_name=excluded.initiative_name,
            status=excluded.status,
            description=excluded.description,
            version=excluded.version,
            expected_client_demand_weight=excluded.expected_client_demand_weight,
            dev_hours_per_client=excluded.dev_hours_per_client,
            support_hours_per_month_per_client=excluded.support_hours_per_month_per_client,
            third_party_cost_per_client=excluded.third_party_cost_per_client,
            third_party_cost_per_month_per_client=excluded.third_party_cost_per_month_per_client,
            hosting_cost_per_month_per_client=excluded.hosting_cost_per_month_per_client,
            pricing_one_time=excluded.pricing_one_time,
            pricing_mrr=excluded.pricing_mrr,
            estimated_client_lifetime_months=excluded.estimated_client_lifetime_months,
            automation_level=excluded.automation_level,
            scaling_constraints=excluded.scaling_constraints,
            updated_at=now()
        `);

        await db.unsafe(
          `insert into ceo_sop_version_history (id, sop_id, version, sop_json)
           values (
             ${JSON.stringify(`ver_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`)},
             ${JSON.stringify(sopId)},
             1,
             ${JSON.stringify(notionPayload)}::jsonb
           ) on conflict do nothing`
        );
      }

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, sopId, notionPayload, dbInsert }, null, 2) }] };
    }

    if (name === "link-sops-to-kpis") {
      const parsed = LinkSopsToKpisInput.parse(obj);
      await ensureDefaultKpis(db);

      const sops: SopRecord[] = (() => {
        if (parsed.sop_ids?.length) {
          // TODO: if specific ids are provided, filter. We keep this tool simple.
        }
        return [];
      })();

      const activeSops = await getActiveSops(db);
      const pick = parsed.sop_ids?.length ? activeSops.filter((s) => parsed.sop_ids?.includes(s.id)) : activeSops;

      // Heuristic KPI links (repeatable defaults).
      function kpiLinksForSop(sop: SopRecord) {
        const links: Array<{ kpiId: string; weight: number }> = [];
        links.push({ kpiId: "kpi_new_clients_month", weight: parsed.link_strength_default });
        if (sop.pricing_mrr > 0) {
          links.push({ kpiId: "kpi_mrr", weight: parsed.link_strength_default });
          links.push({ kpiId: "kpi_arpc", weight: parsed.link_strength_default * 0.8 });
        }
        // High support effort often correlates with retention/satisfaction.
        if (sop.support_hours_per_month_per_client <= 8) links.push({ kpiId: "kpi_retention", weight: 0.9 });
        links.push({ kpiId: "kpi_gross_margin", weight: 1 });
        if (sop.sop_type.toLowerCase().includes("support") || sop.support_hours_per_month_per_client >= 8) {
          links.push({ kpiId: "kpi_nps", weight: 0.7 });
          links.push({ kpiId: "kpi_churn_rate", weight: 0.7 });
        }
        return links;
      }

      const linksOut: Array<{ sop_id: string; kpi_links: Array<{ kpi_id: string; weight: number }> }> = [];
      for (const sop of pick) {
        const kpiLinks = kpiLinksForSop(sop);
        linksOut.push({ sop_id: sop.id, kpi_links: kpiLinks.map((l) => ({ kpi_id: l.kpiId, weight: l.weight })) });
        if (parsed.persist_to_db) {
          await upsertKpiLinks(db, { sopId: sop.id, kpiLinks });
        }
      }

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, linksOut }, null, 2) }] };
    }

    if (name === "create-sop-hierarchy") {
      const parsed = CreateSopHierarchyInput.parse(obj);
      const sops = await getActiveSops(db);
      const chosen = parsed.status === "all" ? sops : sops;

      // Parent: parent_sop. Child: initiative_name.
      const groups = new Map<string, { parent: string; children: SopRecord[] }>();
      for (const sop of chosen) {
        const key = sop.parent_sop || "Uncategorized";
        if (!groups.has(key)) groups.set(key, { parent: key, children: [] });
        groups.get(key)!.children.push(sop);
      }

      const nodes: Array<{ id: string; label: string; type: "group" | "sop"; meta?: any }> = [];
      const edges: Array<{ from: string; to: string; label?: string }> = [];

      for (const [g, val] of groups.entries()) {
        const groupId = `grp_${crypto.createHash("md5").update(g).digest("hex").slice(0, 8)}`;
        nodes.push({ id: groupId, label: g, type: "group" });
        for (const sop of val.children) {
          const nodeId = `sop_${crypto.createHash("md5").update(sop.id).digest("hex").slice(0, 8)}`;
          nodes.push({
            id: nodeId,
            label: sop.initiative_name,
            type: "sop",
            meta: {
              sop_id: sop.id,
              sop_type: sop.sop_type,
              status: sop.status,
              automation_level: sop.automation_level,
              dev_hours_per_client: sop.dev_hours_per_client,
              support_hours_per_month_per_client: sop.support_hours_per_month_per_client,
            },
          });
          edges.push({ from: groupId, to: nodeId });
        }
      }

      return {
        content: [{ type: "text", text: JSON.stringify({ ok: true, figma: { nodes, edges } }, null, 2) }],
      };
    }

    if (name === "suggest-process-improvements") {
      const parsed = SuggestProcessImprovementsInput.parse(obj);
      const sops: SopRecord[] = Array.isArray(parsed.sops)
        ? (parsed.sops as any).map((s: any) => ({
            id: String(s.id ?? crypto.randomBytes(4).toString("hex")),
            parent_sop: String(s.parent_sop ?? ""),
            sop_type: String(s.sop_type ?? ""),
            initiative_name: String(s.initiative_name ?? "Unknown SOP"),
            status: String(s.status ?? "active"),
            description: String(s.description ?? ""),
            version: Number(s.version ?? 1),
            expected_client_demand_weight: Number(s.expected_client_demand_weight ?? 1),
            dev_hours_per_client: Number(s.dev_hours_per_client ?? 0),
            support_hours_per_month_per_client: Number(s.support_hours_per_month_per_client ?? 0),
            third_party_cost_per_client: Number(s.third_party_cost_per_client ?? 0),
            third_party_cost_per_month_per_client: Number(s.third_party_cost_per_month_per_client ?? 0),
            hosting_cost_per_month_per_client: Number(s.hosting_cost_per_month_per_client ?? 0),
            pricing_one_time: Number(s.pricing_one_time ?? 0),
            pricing_mrr: Number(s.pricing_mrr ?? 0),
            estimated_client_lifetime_months: Number(s.estimated_client_lifetime_months ?? 12),
            automation_level: Number(s.automation_level ?? 0.3),
            scaling_constraints: String(s.scaling_constraints ?? ""),
          }))
        : await getActiveSops(db);

      const goals = await ensureGoalsRow(db);
      const improvements = sops.map((sop) => {
        const econ = computeUnitEconomics({
          dev_hours_per_client: sop.dev_hours_per_client,
          support_hours_per_month_per_client: sop.support_hours_per_month_per_client,
          third_party_cost_per_client: sop.third_party_cost_per_client,
          third_party_cost_per_month_per_client: sop.third_party_cost_per_month_per_client,
          hosting_cost_per_month_per_client: sop.hosting_cost_per_month_per_client,
          pricing_one_time: sop.pricing_one_time,
          pricing_mrr: sop.pricing_mrr,
          estimated_client_lifetime_months: sop.estimated_client_lifetime_months,
          team_rate_per_hour: goals.team_rate_per_hour,
        });

        const actions: string[] = [];
        if (sop.dev_hours_per_client >= 80) actions.push("Standardize scope (templates) and add automation to drop dev hours < 60h/client.");
        if (sop.support_hours_per_month_per_client >= 10) actions.push("Introduce low-touch support workflows (async updates, self-serve, SLAs).");
        if (sop.automation_level < 0.2) actions.push("Invest in delivery tooling to raise automation_level and reduce manual steps.");
        if (econ.grossMargin < 0) actions.push("Reprice or reduce cost drivers; add minimum lifetime commitment to improve gross margin.");
        if (econ.paybackMonths > 12) actions.push("Shorten payback via bundling + higher upfront or annual commitments.");
        if (!actions.length) actions.push("Keep current SOP; monitor for drift and add incremental automations only.");

        return {
          sop_id: sop.id,
          initiative_name: sop.initiative_name,
          econSummary: {
            grossMargin: econ.grossMargin,
            grossMarginPct: econ.grossMarginPct,
            paybackMonths: econ.paybackMonths,
          },
          suggested_actions: actions,
          rationale_flags: econ.grossMargin < 0 ? ["negative_margin"] : [],
        };
      });

      return { content: [{ type: "text", text: JSON.stringify({ ok: true, improvements }, null, 2) }] };
    }

    if (name === "recommend-new-sops") {
      // handled above
      throw new Error("Unreachable: recommend-new-sops should be handled earlier.");
    }

    if (name === "identify-scaling-gaps") {
      // handled above
      throw new Error("Unreachable: identify-scaling-gaps should be handled earlier.");
    }

    throw new Error(`Unknown tool: ${name}`);
  } finally {
    await db.end({ timeout: 5 }).catch(() => {});
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

