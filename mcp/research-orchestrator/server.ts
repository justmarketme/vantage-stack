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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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

function extractDomain(urlOrDomain: string): string {
  const raw = (urlOrDomain || "").trim();
  if (!raw) return "";
  try {
    if (raw.includes("://")) return new URL(raw).hostname.replace(/^www\./, "");
    // if it's already a domain, normalize
    return raw.replace(/^www\./, "").split("/")[0]!;
  } catch {
    return raw.replace(/^www\./, "").split("/")[0]!;
  }
}

function isProbablyHtml(s: string) {
  const t = (s || "").trim().toLowerCase();
  return t.includes("<html") || t.includes("<!doctype") || t.includes("<head") || t.includes("<body");
}

function stripTags(html: string) {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeKeywords(text: string) {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "your",
    "you",
    "are",
    "was",
    "were",
    "have",
    "has",
    "had",
    "not",
    "but",
    "our",
    "their",
    "they",
    "them",
    "what",
    "when",
    "where",
    "who",
    "why",
    "how",
    "can",
    "will",
    "all",
    "any",
    "get",
    "use",
    "using",
    "about",
    "into",
    "over",
    "more",
    "most",
    "best",
    "new",
    "free",
    "pricing",
    "login",
    "sign",
    "terms",
    "privacy",
    "cookie",
    "cookies",
  ]);
  const words = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .filter((w) => w.length >= 3 && w.length <= 28 && !stop.has(w) && !/^\d+$/.test(w));

  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
  return counts;
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
    alter table reports add column if not exists research_json jsonb;
    alter table reports add column if not exists research_complete boolean not null default false;
    create index if not exists reports_client_created_idx on reports (client_id, created_at desc);
    create index if not exists reports_type_created_idx on reports (report_type, created_at desc);
  `);
}

const CallSimilarwebInput = z.object({
  domain: z.string().min(1),
});

async function callSimilarwebApi(_input: z.infer<typeof CallSimilarwebInput>) {
  // Deprecated in free-only mode. Keep the tool name for backwards compatibility with existing prompts/workflows.
  return {
    deprecated: true,
    provider: "similarweb",
    note: "Similarweb is not configured in free-only mode. Use Tranco/OpenPageRank + keyword extraction via aggregate-competitor-data.",
  };
}

const CallSemrushInput = z.object({
  domain: z.string().min(1),
});

async function callSemrushApi(_input: z.infer<typeof CallSemrushInput>) {
  // Deprecated in free-only mode. Keep the tool name for backwards compatibility with existing prompts/workflows.
  return {
    deprecated: true,
    provider: "semrush",
    note: "Semrush is not configured in free-only mode. Use OpenPageRank + keyword extraction via aggregate-competitor-data.",
  };
}

const CallTrancoInput = z.object({
  domain: z.string().min(1),
});

async function callTrancoRank(input: z.infer<typeof CallTrancoInput>) {
  const domain = extractDomain(input.domain);
  const url = `https://tranco-list.eu/api/ranks/domain/${encodeURIComponent(domain)}`;
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Tranco error ${res.status}: ${text}`);
  const json = JSON.parse(text);
  const ranks = Array.isArray(json?.ranks) ? json.ranks : Array.isArray(json) ? json : [];
  const latest = ranks[0] ?? null;
  const rank = safeNum(latest?.rank) ?? safeNum(latest?.rank?.rank) ?? safeNum(latest?.rank_value);
  const date = typeof latest?.date === "string" ? latest.date : undefined;
  return { domain, raw: json, extracted: { latestRank: rank, latestDate: date } };
}

const CallOpenPageRankInput = z.object({
  domain: z.string().min(1),
  api_key: z.string().optional(),
});

async function callOpenPageRank(input: z.infer<typeof CallOpenPageRankInput>) {
  const apiKey = (input.api_key || env("OPENPAGERANK_API_KEY") || "").trim();
  if (!apiKey) throw new Error("OPENPAGERANK_API_KEY is required (or pass api_key).");
  const domain = extractDomain(input.domain);

  const u = new URL("https://openpagerank.com/api/v1.0/getPageRank");
  u.searchParams.append("domains[]", domain);
  const res = await fetch(u.toString(), { method: "GET", headers: { "API-OPR": apiKey } });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenPageRank error ${res.status}: ${text}`);
  const json = JSON.parse(text);

  const r0 = Array.isArray(json?.response) ? json.response[0] : undefined;
  const pageRankInteger = safeNum(r0?.page_rank_integer);
  const rank = safeNum(r0?.rank);
  return { domain, raw: json, extracted: { pageRankInteger, rank } };
}

const CallWhoisInput = z.object({
  domain: z.string().min(1),
  base_url: z.string().optional(),
  api_key: z.string().optional(),
});

function domainAgeYearsFromRegistrationDate(registrationDateIso: string | undefined): number | undefined {
  if (!registrationDateIso) return undefined;
  const d = new Date(registrationDateIso);
  if (!Number.isFinite(d.getTime())) return undefined;
  const now = Date.now();
  const years = (now - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return years >= 0 ? Math.round(years * 10) / 10 : undefined;
}

async function callWhoisApi(input: z.infer<typeof CallWhoisInput>) {
  const baseUrl = (input.base_url || env("WHOIS_BASE_URL") || "").trim();
  const apiKey = (input.api_key || env("WHOIS_API_KEY") || "").trim();
  const domain = extractDomain(input.domain);

  // Option A (preferred): call WhoisJSON directly (no /lookup gateway required).
  // When WHOIS_BASE_URL is blank, use WhoisJSON's real endpoint and API auth format.
  if (!baseUrl) {
    if (!apiKey) throw new Error("WHOIS_API_KEY is required.");
    const url = new URL("https://whoisjson.com/api/v1/whois");
    url.searchParams.set("domain", domain);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        // WhoisJSON expects: Authorization: TOKEN=YOUR_API_KEY
        Authorization: `TOKEN=${apiKey}`,
      },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`WhoisJSON error ${res.status}: ${text}`);
    const json = JSON.parse(text);

    const registrationDate =
      (typeof json?.created === "string" ? json.created : undefined) ??
      (typeof json?.registrationDate === "string" ? json.registrationDate : undefined) ??
      (typeof json?.createdDate === "string" ? json.createdDate : undefined) ??
      (typeof json?.data?.createdDate === "string" ? json.data.createdDate : undefined);

    const domainAgeYears = domainAgeYearsFromRegistrationDate(registrationDate);
    return { domain, raw: json, extracted: { registrationDate, domainAgeYears } };
  }

  // Legacy / gateway mode: call {WHOIS_BASE_URL}/lookup?domain=...&api_key=...
  if (!baseUrl) throw new Error("WHOIS_BASE_URL is required (or pass base_url).");
  const url = new URL("/lookup", baseUrl);
  url.searchParams.set("domain", domain);
  if (apiKey) url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), { method: "GET" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Whois error ${res.status}: ${text}`);
  const json = JSON.parse(text);

  const registrationDate =
    (typeof json?.registrationDate === "string" ? json.registrationDate : undefined) ??
    (typeof json?.created === "string" ? json.created : undefined) ??
    (typeof json?.createdDate === "string" ? json.createdDate : undefined) ??
    (typeof json?.data?.createdDate === "string" ? json.data.createdDate : undefined) ??
    (typeof json?.data?.registrationDate === "string" ? json.data.registrationDate : undefined);

  const domainAgeYears = domainAgeYearsFromRegistrationDate(registrationDate);

  return { domain, raw: json, extracted: { registrationDate, domainAgeYears } };
}

const CallPagespeedInput = z.object({
  url: z.string().min(1),
  api_key: z.string().optional(),
});

async function callPagespeedApi(input: z.infer<typeof CallPagespeedInput>) {
  const apiKey = (input.api_key || env("PAGESPEED_API_KEY") || "").trim();
  const targetUrl = input.url.trim();

  const base = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
  const makeUrl = (strategy: "mobile" | "desktop") => {
    const u = new URL(base);
    u.searchParams.set("url", targetUrl);
    u.searchParams.set("strategy", strategy);
    if (apiKey) u.searchParams.set("key", apiKey);
    return u.toString();
  };

  async function run(strategy: "mobile" | "desktop") {
    const res = await fetch(makeUrl(strategy), { method: "GET" });
    const text = await res.text();
    if (!res.ok) throw new Error(`PageSpeed error ${res.status}: ${text}`);
    const json = JSON.parse(text);
    const score01 = safeNum(json?.lighthouseResult?.categories?.performance?.score);
    const score = typeof score01 === "number" ? Math.round(score01 * 100) : safeNum(json?.pagespeedScore);
    const cwv = json?.loadingExperience?.metrics ?? json?.originLoadingExperience?.metrics ?? null;
    return { raw: json, extracted: { performanceScore: score, coreWebVitals: cwv } };
  }

  const [mobile, desktop] = await Promise.all([run("mobile"), run("desktop")]);
  return {
    url: targetUrl,
    raw: { mobile: mobile.raw, desktop: desktop.raw },
    extracted: {
      pagespeedScore: desktop.extracted.performanceScore,
      mobileScore: mobile.extracted.performanceScore,
      coreWebVitals: mobile.extracted.coreWebVitals ?? desktop.extracted.coreWebVitals,
    },
  };
}

const ClientProfileInput = z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  websiteUrl: z.string().optional(),
  industry: z.string().optional(),
  revenueRange: z.string().optional(),
  competitors: z.array(z.string()).optional().default([]),
  currentMarketing: z.record(z.any()).optional(),
  pg_url: z.string().optional(),
  delay_ms: z.number().int().min(0).max(10_000).optional().default(1000),
});

type DomainResearch = {
  domain: string;
  websiteUrl?: string;
  traffic?: {
    // In free-only mode, these Similarweb fields may be undefined.
    monthlyVisitors?: number;
    bounceRate?: number;
    topSources?: Array<{ source: string; share?: number }>;
    // Free signals
    trancoRank?: number;
  };
  semrush?: {
    // In free-only mode, keyword volume/backlink fields are best-effort and may be undefined.
    topKeywords: Array<{ keyword: string; volume?: number }>;
    backlinksCount?: number;
    referringDomains?: number;
    domainAuthority?: number;
    openPageRank?: { pageRankInteger?: number; rank?: number };
  };
  whois?: { registrationDate?: string; domainAgeYears?: number };
  pagespeed?: { pagespeedScore?: number; mobileScore?: number; coreWebVitals?: unknown };
  extractedKeywords?: Array<{ keyword: string; score: number }>;
  errors: Array<{ provider: string; message: string }>;
};

async function extractKeywordsFromWebsite(websiteUrl: string) {
  const res = await fetch(websiteUrl, { method: "GET", redirect: "follow" });
  const text = await res.text();
  if (!res.ok) throw new Error(`Website fetch error ${res.status}: ${text.slice(0, 300)}`);
  if (!isProbablyHtml(text)) throw new Error("Website response does not look like HTML.");

  const titleMatch = text.match(/<title[^>]*>([\s\S]{0,300})<\/title>/i);
  const title = titleMatch?.[1] ? stripTags(titleMatch[1]).slice(0, 200) : "";

  const metaDescMatch = text.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']{0,300})["'][^>]*>/i);
  const desc = metaDescMatch?.[1] ? stripTags(metaDescMatch[1]).slice(0, 250) : "";

  // Pull a bit more visible text, but cap for performance.
  const visible = stripTags(text).slice(0, 10_000);
  const combined = `${title} ${desc} ${visible}`.trim();
  const counts = tokenizeKeywords(combined);

  // Weight title/description terms by counting them again.
  const boost = tokenizeKeywords(`${title} ${title} ${desc}`);
  for (const [k, v] of boost.entries()) counts.set(k, (counts.get(k) ?? 0) + v);

  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([keyword, score]) => ({ keyword, score }));

  return { title, description: desc, topKeywords: top, rawTextSample: visible.slice(0, 800) };
}

async function researchDomain(params: { domainOrUrl: string; delayMs: number }): Promise<DomainResearch> {
  const websiteUrl = params.domainOrUrl.includes("://") ? params.domainOrUrl : `https://${params.domainOrUrl}`;
  const domain = extractDomain(params.domainOrUrl);
  const errors: Array<{ provider: string; message: string }> = [];

  let traffic: DomainResearch["traffic"] | undefined;
  let semrush: DomainResearch["semrush"] | undefined;
  let whois: DomainResearch["whois"] | undefined;
  let pagespeed: DomainResearch["pagespeed"] | undefined;
  let extractedKeywords: DomainResearch["extractedKeywords"] | undefined;

  // Traffic signal: Tranco rank (free)
  try {
    const tr = await callTrancoRank({ domain });
    traffic = { trancoRank: tr.extracted.latestRank };
  } catch (e: any) {
    errors.push({ provider: "tranco", message: String(e?.message ?? e) });
  }
  await sleep(params.delayMs);

  // SEO authority signal: OpenPageRank (free tier, optional)
  try {
    const key = env("OPENPAGERANK_API_KEY");
    if (key) {
      const opr = await callOpenPageRank({ domain, api_key: key });
      semrush = {
        topKeywords: [],
        domainAuthority: opr.extracted.pageRankInteger,
        openPageRank: { pageRankInteger: opr.extracted.pageRankInteger, rank: opr.extracted.rank },
      };
    } else {
      semrush = { topKeywords: [] };
    }
  } catch (e: any) {
    semrush = { topKeywords: [] };
    errors.push({ provider: "openpagerank", message: String(e?.message ?? e) });
  }
  await sleep(params.delayMs);

  // Keyword ideas: on-page extraction (free)
  try {
    const kw = await extractKeywordsFromWebsite(websiteUrl);
    extractedKeywords = kw.topKeywords;
    // Mirror into semrush.topKeywords for backwards compatibility in downstream structs.
    semrush = semrush ?? { topKeywords: [] };
    semrush.topKeywords = kw.topKeywords.map((k) => ({ keyword: k.keyword }));
  } catch (e: any) {
    errors.push({ provider: "keywords", message: String(e?.message ?? e) });
  }
  await sleep(params.delayMs);

  // Whois
  try {
    const wh = await callWhoisApi({ domain });
    whois = { registrationDate: wh.extracted.registrationDate, domainAgeYears: wh.extracted.domainAgeYears };
  } catch (e: any) {
    errors.push({ provider: "whois", message: String(e?.message ?? e) });
  }
  await sleep(params.delayMs);

  // PageSpeed
  try {
    const ps = await callPagespeedApi({ url: websiteUrl });
    pagespeed = { pagespeedScore: ps.extracted.pagespeedScore, mobileScore: ps.extracted.mobileScore, coreWebVitals: ps.extracted.coreWebVitals };
  } catch (e: any) {
    errors.push({ provider: "pagespeed", message: String(e?.message ?? e) });
  }

  return { domain, websiteUrl, traffic, semrush, whois, pagespeed, extractedKeywords, errors };
}

function keywordGap(params: { client: DomainResearch; competitors: DomainResearch[] }) {
  const clientSet = new Set((params.client.semrush?.topKeywords ?? []).map((k) => k.keyword.toLowerCase()));
  const missing: Array<{ keyword: string; volume?: number; competitor?: string }> = [];
  for (const c of params.competitors) {
    for (const k of c.semrush?.topKeywords ?? []) {
      const kw = k.keyword.toLowerCase();
      if (!kw) continue;
      if (!clientSet.has(kw)) missing.push({ keyword: k.keyword, volume: k.volume, competitor: c.domain });
    }
  }
  const best = new Map<string, { keyword: string; volume?: number; competitor?: string }>();
  for (const m of missing) {
    const key = m.keyword.toLowerCase();
    const prev = best.get(key);
    if (!prev || (m.volume ?? 0) > (prev.volume ?? 0)) best.set(key, m);
  }
  return Array.from(best.values()).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 20);
}

function compareClientToCompetitor(client: DomainResearch, competitor: DomainResearch) {
  const clientTraffic = safeNum(client.traffic?.monthlyVisitors);
  const compTraffic = safeNum(competitor.traffic?.monthlyVisitors);
  const clientBacklinks = safeNum(client.semrush?.backlinksCount);
  const compBacklinks = safeNum(competitor.semrush?.backlinksCount);
  const clientDa = safeNum(client.semrush?.domainAuthority);
  const compDa = safeNum(competitor.semrush?.domainAuthority);

  const losing = {
    traffic: compTraffic != null && clientTraffic != null ? clientTraffic < compTraffic : null,
    backlinks: compBacklinks != null && clientBacklinks != null ? clientBacklinks < compBacklinks : null,
    domain_authority: compDa != null && clientDa != null ? clientDa < compDa : null,
  };

  return { losing };
}

export function structureResearchOutput(params: { profile: z.infer<typeof ClientProfileInput>; client: DomainResearch; competitors: DomainResearch[] }) {
  const client = params.client;
  const competitors = params.competitors;

  const gapKeywords = keywordGap({ client, competitors });

  const competitorBenchmarks = competitors.map((c) => ({
    domain: c.domain,
    traffic: c.traffic?.monthlyVisitors,
    bounce_rate: c.traffic?.bounceRate != null ? Math.round((c.traffic?.bounceRate ?? 0) * 1000) / 10 : undefined,
    backlinks: c.semrush?.backlinksCount,
    domain_authority: c.semrush?.domainAuthority,
    comparison: compareClientToCompetitor(client, c),
    errors: c.errors,
  }));

  const websiteHealth = {
    "monthly-visitors": client.traffic?.monthlyVisitors,
    "bounce-rate": client.traffic?.bounceRate != null ? Math.round((client.traffic?.bounceRate ?? 0) * 1000) / 10 : undefined,
    "backlink-count": client.semrush?.backlinksCount,
    "domain-authority": client.semrush?.domainAuthority,
    "page-speed-score": client.pagespeed?.pagespeedScore,
    "domain-age-years": client.whois?.domainAgeYears,
    "tranco-rank": client.traffic?.trancoRank,
  };

  const trafficAnalysis = {
    "estimated-monthly-visitors": client.traffic?.monthlyVisitors,
    "bounce-rate-percentage": client.traffic?.bounceRate != null ? Math.round((client.traffic?.bounceRate ?? 0) * 1000) / 10 : undefined,
    "top-traffic-sources": (client.traffic?.topSources ?? []).slice(0, 3),
    "tranco-rank": client.traffic?.trancoRank,
  };

  const backlinkProfile = {
    "total-backlinks": client.semrush?.backlinksCount,
    "referring-domains": client.semrush?.referringDomains,
    "domain-authority-score": client.semrush?.domainAuthority,
    "openpagerank": client.semrush?.openPageRank ?? null,
  };

  const performanceScore = {
    "page-speed": client.pagespeed?.pagespeedScore,
    "mobile-score": client.pagespeed?.mobileScore,
    "core-web-vitals": client.pagespeed?.coreWebVitals,
  };

  const seoGaps = {
    "top-missing-keywords": gapKeywords.map((k) => ({ keyword: k.keyword, volume: k.volume, competitor: k.competitor })),
    "client-keywords": (client.extractedKeywords ?? []).slice(0, 15),
  };

  return {
    generated_at: new Date().toISOString(),
    client: {
      id: params.profile.clientId,
      name: params.profile.clientName,
      domain: extractDomain(params.profile.websiteUrl || client.domain),
      websiteUrl: params.profile.websiteUrl,
      industry: params.profile.industry,
      revenueRange: params.profile.revenueRange,
      currentMarketing: params.profile.currentMarketing ?? null,
    },
    "website-health": websiteHealth,
    "traffic-analysis": trafficAnalysis,
    "backlink-profile": backlinkProfile,
    "competitor-benchmarks": { competitors: competitorBenchmarks },
    "seo-gaps": seoGaps,
    "performance-score": performanceScore,
    errors: client.errors,
  };
}

async function storeResearchJson(params: { pg_url?: string; client_id?: string; client_name?: string; client_domain?: string; research_json: unknown }) {
  const url = dbUrlFromEnvOrArg(params.pg_url);
  if (!url) throw new Error("REPORTS_PG_URL (or BRIEFING_PG_URL / WEEKLY_PG_URL) is required, or pass pg_url.");

  const db = postgres(url, { max: 5, prepare: false });
  try {
    await ensureReportsTable(db);
    const id = `research_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const createdAt = new Date().toISOString();
    await db`
      insert into reports (
        id, client_id, client_name, client_domain,
        report_type, report_generated, created_at,
        research_json, research_complete
      ) values (
        ${id},
        ${params.client_id ?? null},
        ${params.client_name ?? null},
        ${params.client_domain ?? null},
        ${"onboarding"},
        ${false},
        ${createdAt},
        ${(params.research_json as any)},
        ${true}
      )
    `;
    return { id, created_at: createdAt, report_type: "onboarding", research_complete: true };
  } finally {
    await db.end({ timeout: 5 });
  }
}

const AggregateCompetitorDataInput = ClientProfileInput;

export async function aggregateCompetitorData(profile: z.infer<typeof ClientProfileInput>) {
  const website = (profile.websiteUrl || "").trim();
  if (!website) throw new Error("websiteUrl is required.");
  const delayMs = profile.delay_ms ?? 1000;

  const client = await researchDomain({ domainOrUrl: website, delayMs });
  const competitors: DomainResearch[] = [];

  for (const comp of profile.competitors ?? []) {
    const c = (comp || "").trim();
    if (!c) continue;
    competitors.push(await researchDomain({ domainOrUrl: c, delayMs }));
    await sleep(delayMs);
  }

  const researchJson = structureResearchOutput({ profile, client, competitors });

  const stored = await storeResearchJson({
    pg_url: profile.pg_url,
    client_id: profile.clientId,
    client_name: profile.clientName,
    client_domain: extractDomain(profile.websiteUrl || ""),
    research_json: researchJson,
  });

  return { research: researchJson, stored };
}

const server = new Server({ name: "research-orchestrator", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "call-similarweb-api",
        description: "Deprecated (free-only mode). Kept for backwards compatibility; returns a deprecation notice.",
        inputSchema: {
          type: "object",
          properties: { domain: { type: "string" } },
          required: ["domain"],
        },
      },
      {
        name: "call-semrush-api",
        description: "Deprecated (free-only mode). Kept for backwards compatibility; returns a deprecation notice.",
        inputSchema: {
          type: "object",
          properties: { domain: { type: "string" } },
          required: ["domain"],
        },
      },
      {
        name: "call-tranco-rank",
        description: "Fetch Tranco rank history for a domain and extract the latest rank.",
        inputSchema: { type: "object", properties: { domain: { type: "string" } }, required: ["domain"] },
      },
      {
        name: "call-openpagerank",
        description: "Fetch OpenPageRank data for a domain (requires OPENPAGERANK_API_KEY) and extract pageRankInteger + rank.",
        inputSchema: { type: "object", properties: { domain: { type: "string" }, api_key: { type: "string" } }, required: ["domain"] },
      },
      {
        name: "call-whois-api",
        description: "Call Whois lookup endpoint and extract registrationDate + compute domain age in years.",
        inputSchema: {
          type: "object",
          properties: { domain: { type: "string" }, base_url: { type: "string" }, api_key: { type: "string" } },
          required: ["domain"],
        },
      },
      {
        name: "call-pagespeed-api",
        description: "Call Google PageSpeed Insights API and extract pagespeedScore, mobileScore, core web vitals.",
        inputSchema: { type: "object", properties: { url: { type: "string" }, api_key: { type: "string" } }, required: ["url"] },
      },
      {
        name: "aggregate-competitor-data",
        description:
          "Run full research workflow for client + competitors (Tranco/OpenPageRank/keyword extraction, Whois, PageSpeed), throttle calls, continue on failures, structure research JSON, and store it in reports table (report_type=onboarding, research_complete=true).",
        inputSchema: {
          type: "object",
          properties: {
            clientId: { type: "string" },
            clientName: { type: "string" },
            websiteUrl: { type: "string" },
            industry: { type: "string" },
            revenueRange: { type: "string" },
            competitors: { type: "array", items: { type: "string" } },
            currentMarketing: { type: "object" },
            pg_url: { type: "string" },
            delay_ms: { type: "number" },
          },
        },
      },
      {
        name: "structure-research-output",
        description:
          "Turn a temporary research object into the required research JSON sections (website-health, traffic-analysis, backlink-profile, competitor-benchmarks, seo-gaps, performance-score).",
        inputSchema: { type: "object", properties: { profile: { type: "object" }, client: { type: "object" }, competitors: { type: "array" } }, required: ["profile", "client", "competitors"] },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  if (name === "call-similarweb-api") {
    const parsed = CallSimilarwebInput.parse({
      domain: String(obj.domain ?? ""),
    });
    const out = await callSimilarwebApi(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "call-semrush-api") {
    const parsed = CallSemrushInput.parse({
      domain: String(obj.domain ?? ""),
    });
    const out = await callSemrushApi(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "call-tranco-rank") {
    const parsed = CallTrancoInput.parse({ domain: String(obj.domain ?? "") });
    const out = await callTrancoRank(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "call-openpagerank") {
    const parsed = CallOpenPageRankInput.parse({
      domain: String(obj.domain ?? ""),
      api_key: typeof obj.api_key === "string" ? obj.api_key : undefined,
    });
    const out = await callOpenPageRank(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "call-whois-api") {
    const parsed = CallWhoisInput.parse({
      domain: String(obj.domain ?? ""),
      base_url: typeof obj.base_url === "string" ? obj.base_url : undefined,
      api_key: typeof obj.api_key === "string" ? obj.api_key : undefined,
    });
    const out = await callWhoisApi(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "call-pagespeed-api") {
    const parsed = CallPagespeedInput.parse({
      url: String(obj.url ?? ""),
      api_key: typeof obj.api_key === "string" ? obj.api_key : undefined,
    });
    const out = await callPagespeedApi(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "aggregate-competitor-data") {
    const parsed = AggregateCompetitorDataInput.parse(obj);
    const out = await aggregateCompetitorData(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "structure-research-output") {
    const profile = ClientProfileInput.parse(obj.profile ?? {});
    const client = (obj.client ?? {}) as any;
    const competitors = (Array.isArray(obj.competitors) ? obj.competitors : []) as any[];
    const out = structureResearchOutput({ profile, client, competitors });
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

