#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import postgres from "postgres";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function safeNum(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function toPercent01(v: unknown): number | undefined {
  const n = safeNum(v);
  if (n === undefined) return undefined;
  if (n >= 0 && n <= 1) return n;
  if (n >= 0 && n <= 100) return n / 100;
  return undefined;
}

function normalizeTrafficScore(monthlyVisitors: number | undefined): number | undefined {
  if (monthlyVisitors === undefined || monthlyVisitors < 0) return undefined;
  const v = monthlyVisitors;
  if (v < 1_000) return 10;
  if (v < 10_000) return 30;
  if (v < 100_000) return 60;
  if (v < 1_000_000) return 85;
  return 100;
}

function normalizeDomainAgeScore(domainAgeYears: number | undefined): number | undefined {
  if (domainAgeYears === undefined || domainAgeYears < 0) return undefined;
  return clamp((domainAgeYears / 10) * 100, 0, 100);
}

function normalizeBounceScore(bounceRate01: number | undefined): number | undefined {
  if (bounceRate01 === undefined) return undefined;
  return clamp((1 - bounceRate01) * 100, 0, 100);
}

function scoreToColor(score: number): "red" | "yellow" | "green" {
  if (score < 40) return "red";
  if (score < 70) return "yellow";
  return "green";
}

function computeWebsiteHealthScore(input: {
  monthly_visitors?: number;
  bounce_rate?: number; // 0-1 or 0-100
  domain_authority?: number; // 0-100
  pagespeed_score?: number; // 0-100
  domain_age_years?: number;
}) {
  const traffic = normalizeTrafficScore(safeNum(input.monthly_visitors));
  const bounce = normalizeBounceScore(toPercent01(input.bounce_rate));
  const da = safeNum(input.domain_authority);
  const ps = safeNum(input.pagespeed_score);
  const age = normalizeDomainAgeScore(safeNum(input.domain_age_years));

  const parts: Array<{ key: string; weight: number; score?: number }> = [
    { key: "traffic_volume", weight: 0.3, score: traffic },
    { key: "bounce_rate", weight: 0.2, score: bounce },
    { key: "domain_authority", weight: 0.2, score: da },
    { key: "page_speed", weight: 0.2, score: ps },
    { key: "domain_age", weight: 0.1, score: age },
  ];

  const present = parts.filter((p) => typeof p.score === "number" && Number.isFinite(p.score as number));
  const weightSum = present.reduce((acc, p) => acc + p.weight, 0);
  const score =
    weightSum > 0
      ? present.reduce((acc, p) => acc + (p.score as number) * (p.weight / weightSum), 0)
      : 0;

  const rounded = Math.round(clamp(score, 0, 100));
  return {
    score: rounded,
    color: scoreToColor(rounded),
    inputs: { traffic, bounce, da, ps, age },
    weighting: parts,
    weight_normalized: weightSum !== 1,
  };
}

function pickTopCompetitor(competitors: any[]): any | null {
  if (!Array.isArray(competitors) || competitors.length === 0) return null;
  const sorted = competitors
    .slice()
    .sort((a, b) => (safeNum(b?.traffic_analysis?.monthly_visitors) ?? 0) - (safeNum(a?.traffic_analysis?.monthly_visitors) ?? 0));
  return sorted[0] ?? null;
}

function formatInt(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function formatPct01(p: number | undefined): string {
  if (typeof p !== "number" || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 1000) / 10}%`;
}

function mdColorSwatch(color: "red" | "yellow" | "green") {
  if (color === "green") return "🟢";
  if (color === "yellow") return "🟡";
  return "🔴";
}

const ResearchJsonSchema = z.object({
  client: z
    .object({
      name: z.string().optional(),
      domain: z.string().optional(),
      industry: z.string().optional(),
    })
    .optional(),
  website_health: z
    .object({
      domain_authority: z.number().optional(),
      domain_age_years: z.number().optional(),
      notes: z.string().optional(),
      conversion_audit: z
        .object({
          value_prop_above_fold: z.boolean().optional(),
          social_proof: z.boolean().optional(),
          clear_cta: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
  traffic_analysis: z
    .object({
      monthly_visitors: z.number().optional(),
      bounce_rate: z.number().optional(), // 0-1 or 0-100
      industry_avg_bounce_rate: z.number().optional(), // 0-1 or 0-100
      top_sources: z.array(z.object({ source: z.string(), share: z.number().optional() })).optional(),
    })
    .optional(),
  backlink_profile: z
    .object({
      backlinks_total: z.number().optional(),
      referring_domains: z.number().optional(),
      top_keywords: z.array(z.object({ keyword: z.string(), volume: z.number().optional() })).optional(),
    })
    .optional(),
  performance_score: z
    .object({
      pagespeed_score: z.number().optional(), // 0-100
      mobile: z
        .object({
          performance: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  competitor_benchmarks: z
    .object({
      competitors: z
        .array(
          z.object({
            domain: z.string().optional(),
            website_health: z.object({ domain_authority: z.number().optional(), domain_age_years: z.number().optional() }).optional(),
            traffic_analysis: z.object({ monthly_visitors: z.number().optional(), bounce_rate: z.number().optional() }).optional(),
            backlink_profile: z.object({ backlinks_total: z.number().optional() }).optional(),
            performance_score: z.object({ pagespeed_score: z.number().optional() }).optional(),
            seo_gaps: z.object({ missing_keywords: z.array(z.object({ keyword: z.string(), volume: z.number().optional() })).optional() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  seo_gaps: z
    .object({
      missing_keywords: z.array(z.object({ keyword: z.string(), volume: z.number().optional() })).optional(),
    })
    .optional(),
  revenue_assumptions: z
    .object({
      cpc_usd: z.number().optional(),
      lead_to_customer_conversion_rate: z.number().optional(), // 0-1 or 0-100
      click_to_lead_rate: z.number().optional(), // 0-1 or 0-100
      avg_clv_usd: z.number().optional(),
    })
    .optional(),
});

function defaultsForIndustry(industryRaw: string | undefined) {
  const industry = (industryRaw || "").trim().toLowerCase();
  // Light heuristics; callers can override via research_json.revenue_assumptions.
  if (industry.includes("saas") || industry.includes("software")) {
    return { cpc_usd: 8, lead_to_customer_conversion_rate: 0.12, click_to_lead_rate: 0.08, avg_clv_usd: 6000 };
  }
  if (industry.includes("legal") || industry.includes("law")) {
    return { cpc_usd: 35, lead_to_customer_conversion_rate: 0.18, click_to_lead_rate: 0.06, avg_clv_usd: 12000 };
  }
  if (industry.includes("real estate")) {
    return { cpc_usd: 6, lead_to_customer_conversion_rate: 0.08, click_to_lead_rate: 0.10, avg_clv_usd: 9000 };
  }
  if (industry.includes("health") || industry.includes("medical") || industry.includes("dental")) {
    return { cpc_usd: 10, lead_to_customer_conversion_rate: 0.22, click_to_lead_rate: 0.09, avg_clv_usd: 2500 };
  }
  if (industry.includes("ecommerce") || industry.includes("e-commerce") || industry.includes("shop")) {
    return { cpc_usd: 2.5, lead_to_customer_conversion_rate: 0.04, click_to_lead_rate: 0.03, avg_clv_usd: 180 };
  }
  return { cpc_usd: 6, lead_to_customer_conversion_rate: 0.10, click_to_lead_rate: 0.08, avg_clv_usd: 3000 };
}

function fmtMoney(n: number | undefined): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${(Math.round(n * 100) / 100).toFixed(2)}`;
}

function generateOnboardingReportMarkdown(researchJson: unknown): { markdown: string; health: ReturnType<typeof computeWebsiteHealthScore> } {
  const normalized = normalizeResearchJsonKeys(researchJson);
  const r = ResearchJsonSchema.parse(normalized);

  const clientName = r.client?.name || "Client";
  const domain = r.client?.domain || "";

  const monthlyVisitors = r.traffic_analysis?.monthly_visitors;
  const bounceRate01 = toPercent01(r.traffic_analysis?.bounce_rate);
  const industryBounce01 = toPercent01(r.traffic_analysis?.industry_avg_bounce_rate);
  const domainAuthority = r.website_health?.domain_authority;
  const domainAgeYears = r.website_health?.domain_age_years;
  const pagespeed = r.performance_score?.pagespeed_score ?? r.performance_score?.mobile?.performance;

  const health = computeWebsiteHealthScore({
    monthly_visitors: monthlyVisitors,
    bounce_rate: r.traffic_analysis?.bounce_rate,
    domain_authority: domainAuthority,
    pagespeed_score: pagespeed,
    domain_age_years: domainAgeYears,
  });

  const sources = (r.traffic_analysis?.top_sources ?? []).slice().sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, 3);
  const sourcesLine = sources.length
    ? sources.map((s) => `${s.source}${typeof s.share === "number" ? ` (${formatPct01(toPercent01(s.share) ?? s.share)})` : ""}`).join(", ")
    : "—";

  const competitors = r.competitor_benchmarks?.competitors ?? [];
  const topCompetitor = pickTopCompetitor(competitors as any[]);
  const topCompetitorDomain = topCompetitor?.domain ?? "Top competitor";

  const clientBacklinks = safeNum(r.backlink_profile?.backlinks_total);
  const clientDA = safeNum(domainAuthority);
  const compBacklinks = safeNum(topCompetitor?.backlink_profile?.backlinks_total);
  const compDA = safeNum(topCompetitor?.website_health?.domain_authority);
  const compTraffic = safeNum(topCompetitor?.traffic_analysis?.monthly_visitors);

  const missingKeywordsAll: Array<{ keyword: string; volume?: number }> = [];
  const directMissing = r.seo_gaps?.missing_keywords ?? [];
  for (const k of directMissing) missingKeywordsAll.push({ keyword: k.keyword, volume: k.volume });
  for (const c of competitors) {
    const gaps = (c as any)?.seo_gaps?.missing_keywords;
    if (Array.isArray(gaps)) for (const k of gaps) missingKeywordsAll.push({ keyword: String(k.keyword ?? ""), volume: safeNum(k.volume) });
  }
  const uniq = new Map<string, { keyword: string; volume?: number }>();
  for (const k of missingKeywordsAll) {
    const kw = (k.keyword || "").trim();
    if (!kw) continue;
    const prev = uniq.get(kw.toLowerCase());
    if (!prev) uniq.set(kw.toLowerCase(), { keyword: kw, volume: k.volume });
    else if ((k.volume ?? 0) > (prev.volume ?? 0)) uniq.set(kw.toLowerCase(), { keyword: kw, volume: k.volume });
  }
  const top10Missing = Array.from(uniq.values())
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, 10);

  const audit = r.website_health?.conversion_audit;
  const mobileFastPass = typeof pagespeed === "number" ? pagespeed >= 70 : false;
  const conversionChecks: Array<{ label: string; pass: boolean; reason: string }> = [
    {
      label: "Clear value proposition above the fold",
      pass: audit?.value_prop_above_fold ?? false,
      reason: audit?.value_prop_above_fold === true ? "Present" : "Not confirmed in research data",
    },
    {
      label: "Social proof / testimonials",
      pass: audit?.social_proof ?? false,
      reason: audit?.social_proof === true ? "Present" : "Not confirmed in research data",
    },
    {
      label: "Clear primary call-to-action",
      pass: audit?.clear_cta ?? false,
      reason: audit?.clear_cta === true ? "Present" : "Not confirmed in research data",
    },
    {
      label: "Loads fast on mobile",
      pass: mobileFastPass,
      reason: typeof pagespeed === "number" ? `PageSpeed ${Math.round(pagespeed)}` : "No PageSpeed data found",
    },
  ];

  const storyBits: string[] = [];
  if (typeof monthlyVisitors === "number") {
    storyBits.push(monthlyVisitors < 10_000 ? "You have a visibility gap: discovery traffic is still relatively low." : "You have meaningful traffic momentum to build on.");
  } else {
    storyBits.push("Traffic volume data wasn’t provided; validate baseline sessions/visitors before scaling spend.");
  }
  if (typeof bounceRate01 === "number") {
    storyBits.push(bounceRate01 >= 0.6 ? "Bounce rate suggests an engagement problem (messaging/UX mismatch or slow mobile experience)." : "Bounce rate is reasonably healthy; focus on conversion rate lift.");
  }

  const industryCmp =
    typeof bounceRate01 === "number" && typeof industryBounce01 === "number"
      ? bounceRate01 - industryBounce01
      : undefined;

  const industryLine =
    typeof industryCmp === "number"
      ? `Bounce vs industry avg: ${industryCmp > 0 ? "higher" : "lower"} by ${formatPct01(Math.abs(industryCmp))}.`
      : "Bounce vs industry avg: —";

  const indDefaults = defaultsForIndustry(r.client?.industry);
  const assumptions = {
    cpc_usd: safeNum(r.revenue_assumptions?.cpc_usd) ?? indDefaults.cpc_usd,
    lead_to_customer_conversion_rate:
      toPercent01(r.revenue_assumptions?.lead_to_customer_conversion_rate) ?? indDefaults.lead_to_customer_conversion_rate,
    click_to_lead_rate: toPercent01(r.revenue_assumptions?.click_to_lead_rate) ?? indDefaults.click_to_lead_rate,
    avg_clv_usd: safeNum(r.revenue_assumptions?.avg_clv_usd) ?? indDefaults.avg_clv_usd,
  };

  function scenario(mult: number) {
    const leads = 100 * mult;
    const clickToLead = clamp(assumptions.click_to_lead_rate, 0.001, 1);
    const leadToCustomer = clamp(assumptions.lead_to_customer_conversion_rate, 0, 1);
    const clicks = leads / clickToLead;
    const adSpend = clicks * assumptions.cpc_usd;
    const customers = leads * leadToCustomer;
    const revenue = customers * assumptions.avg_clv_usd;
    return { leads, clicks, ad_spend_usd: adSpend, customers, revenue_usd: revenue };
  }

  const conservative = scenario(0.7);
  const moderate = scenario(1.0);
  const aggressive = scenario(1.5);

  const exec = [
    `${clientName}${domain ? ` (${domain})` : ""} has a baseline digital presence, but the data indicates the biggest lever is improving acquisition efficiency and on-site conversion.`,
    `The highest-impact opportunity is to close the gap versus stronger competitors by targeting high-volume keywords they rank for, while tightening above-the-fold messaging and mobile performance to reduce bounce and convert more leads.`,
  ].join(" ");

  const lines: string[] = [];
  lines.push(`## Executive Summary`);
  lines.push("");
  lines.push(exec);
  lines.push("");

  lines.push(`## Website Health Score`);
  lines.push("");
  lines.push(`**${mdColorSwatch(health.color)} ${health.score}/100**`);
  lines.push("");
  lines.push(
    `Inputs used: traffic ${trafficToText(monthlyVisitors)}, bounce ${formatPct01(bounceRate01)}, domain authority ${formatInt(clientDA)}, PageSpeed ${formatInt(pagespeed)}, domain age ${domainAgeYears != null ? `${Math.round(domainAgeYears)}y` : "—"}.`,
  );
  lines.push("");

  lines.push(`## Traffic Analysis`);
  lines.push("");
  lines.push(`- **Monthly visitors**: ${formatInt(monthlyVisitors)}`);
  lines.push(`- **Bounce rate**: ${formatPct01(bounceRate01)}. ${industryLine}`);
  lines.push(`- **Top 3 traffic sources**: ${sourcesLine}`);
  lines.push("");
  lines.push(storyBits.join(" "));
  lines.push("");

  lines.push(`## Competitive Gap Analysis`);
  lines.push("");
  lines.push(`Comparing **${clientName}** vs **${topCompetitorDomain}**:`);
  lines.push("");
  lines.push(`| Metric | ${clientName} | ${topCompetitorDomain} | Who’s winning |`);
  lines.push(`|---|---:|---:|---|`);
  lines.push(`| Monthly traffic | ${formatInt(monthlyVisitors)} | ${formatInt(compTraffic)} | ${compareWinner(monthlyVisitors, compTraffic)} |`);
  lines.push(`| Backlinks | ${formatInt(clientBacklinks)} | ${formatInt(compBacklinks)} | ${compareWinner(clientBacklinks, compBacklinks)} |`);
  lines.push(`| Domain authority | ${formatInt(clientDA)} | ${formatInt(compDA)} | ${compareWinner(clientDA, compDA)} |`);
  lines.push("");
  lines.push(lossNarrative(clientName, monthlyVisitors, clientBacklinks, clientDA, topCompetitorDomain, compTraffic, compBacklinks, compDA));
  lines.push("");

  lines.push(`## SEO Opportunities`);
  lines.push("");
  if (!top10Missing.length) {
    lines.push("No keyword-gap list was provided in the research JSON.");
  } else {
    lines.push("Top keywords competitors rank for that the client does not (by volume):");
    lines.push("");
    for (const k of top10Missing) {
      lines.push(`- **${k.keyword}**${typeof k.volume === "number" ? ` — ${formatInt(k.volume)} searches/mo` : ""}`);
    }
  }
  lines.push("");

  lines.push(`## Conversion Critique`);
  lines.push("");
  lines.push("Framework lens: **Value Equation + funnel clarity** (message → proof → CTA → speed).");
  lines.push("");
  for (const c of conversionChecks) {
    lines.push(`- **${c.label}**: ${c.pass ? "PASS" : "FAIL"} (${c.reason})`);
  }
  lines.push("");

  lines.push(`## Revenue Opportunity Analysis`);
  lines.push("");
  lines.push(`Assumptions (industry: ${r.client?.industry ?? "unspecified"}):`);
  lines.push(`- **Avg CPC**: ${fmtMoney(assumptions.cpc_usd)}`);
  lines.push(`- **Click → lead rate**: ${formatPct01(assumptions.click_to_lead_rate)}`);
  lines.push(`- **Lead → customer conversion rate**: ${formatPct01(assumptions.lead_to_customer_conversion_rate)}`);
  lines.push(`- **Avg CLV**: ${fmtMoney(assumptions.avg_clv_usd)}`);
  lines.push("");
  lines.push("If we drive **100 leads/month** (scaled by scenario), estimated outcomes:");
  lines.push("");
  lines.push(`| Scenario | Leads/mo | Est. clicks/mo | Est. ad spend/mo | Est. customers/mo | Est. revenue/mo |`);
  lines.push(`|---|---:|---:|---:|---:|---:|`);
  lines.push(`| Conservative | ${formatInt(conservative.leads)} | ${formatInt(conservative.clicks)} | ${fmtMoney(conservative.ad_spend_usd)} | ${formatInt(conservative.customers)} | ${fmtMoney(conservative.revenue_usd)} |`);
  lines.push(`| Moderate | ${formatInt(moderate.leads)} | ${formatInt(moderate.clicks)} | ${fmtMoney(moderate.ad_spend_usd)} | ${formatInt(moderate.customers)} | ${fmtMoney(moderate.revenue_usd)} |`);
  lines.push(`| Aggressive | ${formatInt(aggressive.leads)} | ${formatInt(aggressive.clicks)} | ${fmtMoney(aggressive.ad_spend_usd)} | ${formatInt(aggressive.customers)} | ${fmtMoney(aggressive.revenue_usd)} |`);
  lines.push("");

  lines.push(`## Recommended Next Steps`);
  lines.push("");
  const nextSteps: string[] = [];
  if (health.score < 70) nextSteps.push("- **Website redesign**: tighten value prop + proof + CTA above the fold; reduce bounce and raise conversion.");
  if (typeof monthlyVisitors === "number" && monthlyVisitors >= 20_000) {
    nextSteps.push("- **Paid ads management**: you have enough traffic signals; scale high-intent campaigns and retargeting while protecting CAC.");
  } else {
    nextSteps.push("- **SEO optimization**: close visibility gaps with keyword-gap pages and technical SEO to grow organic sessions.");
  }
  nextSteps.push("- **Conversion rate optimization (CRO) sprints**: landing page experiments + offer framing to turn more clicks into qualified leads.");
  lines.push(...nextSteps);
  lines.push("");

  return { markdown: lines.join("\n").trim() + "\n", health };
}

function normalizeResearchJsonKeys(input: unknown): unknown {
  const o = asObject(input);
  if (!o) return input;
  // Accept Agent 2’s hyphenated keys by mapping them to underscores used internally.
  const out: Record<string, unknown> = { ...o };
  const map: Record<string, string> = {
    "website-health": "website_health",
    "traffic-analysis": "traffic_analysis",
    "backlink-profile": "backlink_profile",
    "competitor-benchmarks": "competitor_benchmarks",
    "seo-gaps": "seo_gaps",
    "performance-score": "performance_score",
  };
  for (const [k, v] of Object.entries(map)) {
    if (out[k] != null && out[v] == null) out[v] = out[k];
  }
  // Also map inner hyphenated keys if present (best-effort).
  const wh = asObject(out["website_health"] ?? out["website-health"]);
  if (wh) {
    if (wh["backlink-count"] != null && wh["backlinks_total"] == null) wh["backlinks_total"] = wh["backlink-count"];
    if (wh["domain-authority"] != null && wh["domain_authority"] == null) wh["domain_authority"] = wh["domain-authority"];
    if (wh["page-speed-score"] != null && wh["pagespeed_score"] == null) wh["pagespeed_score"] = wh["page-speed-score"];
    if (wh["domain-age-years"] != null && wh["domain_age_years"] == null) wh["domain_age_years"] = wh["domain-age-years"];
  }
  const ps = asObject(out["performance_score"] ?? out["performance-score"]);
  if (ps) {
    if (ps["page-speed-score"] != null && ps["pagespeed_score"] == null) ps["pagespeed_score"] = ps["page-speed-score"];
  }
  return out;
}

function trafficToText(monthlyVisitors: number | undefined) {
  if (typeof monthlyVisitors !== "number" || !Number.isFinite(monthlyVisitors)) return "—";
  return formatInt(monthlyVisitors);
}

function compareWinner(a: number | undefined, b: number | undefined) {
  const aa = typeof a === "number" && Number.isFinite(a) ? a : undefined;
  const bb = typeof b === "number" && Number.isFinite(b) ? b : undefined;
  if (aa === undefined && bb === undefined) return "—";
  if (aa === undefined) return "Competitor";
  if (bb === undefined) return "Client";
  if (aa === bb) return "Tie";
  return aa > bb ? "Client" : "Competitor";
}

function lossNarrative(
  clientName: string,
  clientTraffic: number | undefined,
  clientBacklinks: number | undefined,
  clientDa: number | undefined,
  compName: string,
  compTraffic: number | undefined,
  compBacklinks: number | undefined,
  compDa: number | undefined,
) {
  const losses: string[] = [];
  if ((compTraffic ?? 0) > (clientTraffic ?? 0)) losses.push("traffic");
  if ((compBacklinks ?? 0) > (clientBacklinks ?? 0)) losses.push("backlinks");
  if ((compDa ?? 0) > (clientDa ?? 0)) losses.push("domain authority");
  if (!losses.length) return `On these measured metrics, ${clientName} is not materially behind ${compName}.`;
  return `${clientName} is currently losing on **${losses.join(", ")}** versus ${compName}, which typically indicates a visibility + authority gap (and often a compounding disadvantage in SEO).`;
}

function dbUrlFromEnvOrArg(arg?: string) {
  const direct = (arg || "").trim();
  if (direct) return direct;
  const url = env("REPORTS_PG_URL") || env("BRIEFING_PG_URL") || env("WEEKLY_PG_URL");
  return url || "";
}

async function ensureReportsTable(db: ReturnType<typeof postgres>) {
  await db.unsafe(`
    create table if not exists reports (
      id text primary key,
      client_id text,
      client_name text,
      client_domain text,
      report_type text not null,
      report_generated boolean not null default false,
      created_at timestamptz not null,
      health_score int,
      source jsonb,
      report_markdown text,
      research_json jsonb,
      research_complete boolean not null default false
    );
    alter table reports add column if not exists report_markdown text;
    alter table reports add column if not exists research_json jsonb;
    alter table reports add column if not exists research_complete boolean not null default false;
    create index if not exists reports_client_created_idx on reports (client_id, created_at desc);
    create index if not exists reports_type_created_idx on reports (report_type, created_at desc);
  `);
}

async function insertOnboardingReport(params: {
  pg_url?: string;
  client_id?: string;
  research_json: unknown;
}) {
  const parsed = ResearchJsonSchema.parse(params.research_json);
  const url = dbUrlFromEnvOrArg(params.pg_url);
  if (!url) throw new Error("REPORTS_PG_URL (or BRIEFING_PG_URL / WEEKLY_PG_URL) is required, or pass pg_url.");

  const db = postgres(url, { max: 5, prepare: false });
  try {
    await ensureReportsTable(db);
    const { markdown, health } = generateOnboardingReportMarkdown(parsed);
    const id = `report_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const createdAt = new Date().toISOString();

    await db`
      insert into reports (
        id, client_id, client_name, client_domain,
        report_type, report_generated, created_at,
        health_score, source, report_markdown
      ) values (
        ${id},
        ${params.client_id ?? null},
        ${parsed.client?.name ?? null},
        ${parsed.client?.domain ?? null},
        ${"onboarding-report"},
        ${true},
        ${createdAt},
        ${health.score},
        ${(parsed as any)},
        ${markdown}
      )
    `;

    return { id, created_at: createdAt, report_type: "onboarding-report", report_generated: true, health_score: health.score, markdown };
  } finally {
    await db.end({ timeout: 5 });
  }
}

const GenerateOnboardingReportInput = z.object({
  client_id: z.string().optional(),
  pg_url: z.string().optional(),
  research_json: z.unknown(),
});

const server = new Server({ name: "report-generator", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "generate-onboarding-report",
        description:
          "Generate a markdown onboarding report from Agent 2 research JSON, and store it in the Postgres reports table (report_type=onboarding-report, report_generated=true).",
        inputSchema: {
          type: "object",
          properties: {
            client_id: { type: "string", description: "Optional client ID to associate to this report." },
            pg_url: { type: "string", description: "Optional Postgres URL override. Defaults to REPORTS_PG_URL / BRIEFING_PG_URL / WEEKLY_PG_URL." },
            research_json: { type: "object", description: "Agent 2 research JSON payload." },
          },
          required: ["research_json"],
        },
      },
      {
        name: "format-onboarding-report",
        description:
          "Format an onboarding report markdown from Agent 2 research JSON without writing to the database.",
        inputSchema: {
          type: "object",
          properties: { research_json: { type: "object", description: "Agent 2 research JSON payload." } },
          required: ["research_json"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  if (name === "format-onboarding-report") {
    const { markdown, health } = generateOnboardingReportMarkdown(obj.research_json);
    return { content: [{ type: "text", text: JSON.stringify({ health_score: health.score, markdown }, null, 2) }] };
  }

  if (name === "generate-onboarding-report") {
    const parsed = GenerateOnboardingReportInput.parse({
      client_id: typeof obj.client_id === "string" ? obj.client_id : undefined,
      pg_url: typeof obj.pg_url === "string" ? obj.pg_url : undefined,
      research_json: (obj as any).research_json ?? {},
    });
    const out = await insertOnboardingReport(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

