#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return "";
}

function normalizeKey(k: string): string {
  return (k || "")
    .trim()
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePhone(v: string): string {
  const s = (v || "").trim();
  if (!s) return "";
  // Keep leading +, digits only otherwise.
  const plus = s.startsWith("+") ? "+" : "";
  const digits = s.replace(/[^\d]/g, "");
  return digits ? plus + digits : "";
}

function normalizeEmail(v: string): string {
  return (v || "").trim().toLowerCase();
}

function isValidEmail(v: string): { valid: boolean; reason?: string } {
  const email = normalizeEmail(v);
  if (!email) return { valid: false, reason: "missing" };
  if (email.length > 254) return { valid: false, reason: "too_long" };
  const at = email.indexOf("@");
  if (at <= 0 || at !== email.lastIndexOf("@")) return { valid: false, reason: "invalid_format" };
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local || !domain) return { valid: false, reason: "invalid_format" };
  if (!domain.includes(".")) return { valid: false, reason: "domain_missing_dot" };
  if (/\s/.test(email)) return { valid: false, reason: "contains_whitespace" };
  return { valid: true };
}

function normalizeUrl(v: string): string {
  const raw = (v || "").trim();
  if (!raw) return "";
  const withProto = raw.includes("://") ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (!u.hostname) return "";
    u.hash = "";
    // Normalize common tracking noise by removing empty path.
    if (u.pathname === "/") u.pathname = "";
    return u.toString();
  } catch {
    return "";
  }
}

function domainFromUrl(v: string): string {
  const raw = (v || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]!.toLowerCase();
  }
}

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
]);

function splitListish(v: string): string[] {
  const raw = (v || "").trim();
  if (!raw) return [];
  // Split on newlines first; then commas/semicolons if line is dense.
  const lines = raw
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts: string[] = [];
  for (const line of lines.length ? lines : [raw]) {
    const dense = (line.match(/[,;•]/g) || []).length >= 1;
    if (dense) {
      parts.push(
        ...line
          .split(/[,;•]+/g)
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else {
      parts.push(line);
    }
  }
  // De-dupe while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

const RequiredBlueprintKeys = [
  "client_name",
  "email",
  "whatsapp",
  "website_url",
  "industry",
  "revenue_range",
  "top_three_challenges",
  "competitors",
  "current_marketing_channels",
  "tools_in_use",
  "monthly_budget",
  "success_goals",
] as const;

type BlueprintKey = (typeof RequiredBlueprintKeys)[number];

const KEY_ALIASES: Record<BlueprintKey, string[]> = {
  client_name: ["client_name", "name", "company_name", "business_name", "client", "company"],
  email: ["email", "email_address", "contact_email"],
  whatsapp: ["whatsapp", "whats_app", "whatsapp_number", "phone", "phone_number", "mobile", "contact_number"],
  website_url: ["website_url", "website", "site", "url", "domain"],
  industry: ["industry", "niche", "sector", "vertical"],
  revenue_range: ["revenue_range", "revenue", "annual_revenue", "monthly_revenue", "turnover"],
  top_three_challenges: ["top_three_challenges", "challenges", "top_challenges", "pain_points", "problems"],
  competitors: ["competitors", "competitor", "competition"],
  current_marketing_channels: ["current_marketing_channels", "marketing_channels", "channels", "acquisition_channels"],
  tools_in_use: ["tools_in_use", "tools", "stack", "software", "platforms"],
  monthly_budget: ["monthly_budget", "budget", "marketing_budget", "ad_budget", "monthly_marketing_budget"],
  success_goals: ["success_goals", "goals", "objectives", "success_metrics", "kpis"],
};

function coerceResponses(input: unknown): Record<string, unknown> {
  const obj = asObject(input);
  if (!obj) return {};

  // Common form payload shapes:
  // - { responses: { ... } }
  // - { fields: { ... } }
  // - { answers: [{ key, label, value }] }
  if (asObject(obj.responses)) return asObject(obj.responses) ?? {};
  if (asObject(obj.fields)) return asObject(obj.fields) ?? {};

  const answers = obj.answers;
  if (Array.isArray(answers)) {
    const out: Record<string, unknown> = {};
    for (const a of answers) {
      const ao = asObject(a);
      if (!ao) continue;
      const k = normalizeKey(asString(ao.key || ao.name || ao.id || ao.label));
      const v = ao.value ?? ao.answer ?? ao.response ?? "";
      if (k) out[k] = v;
    }
    return out;
  }

  return obj;
}

function pickField(responses: Record<string, unknown>, key: BlueprintKey): unknown {
  const norm = Object.fromEntries(Object.entries(responses).map(([k, v]) => [normalizeKey(k), v]));
  for (const alias of KEY_ALIASES[key]) {
    const v = norm[normalizeKey(alias)];
    if (v !== undefined && v !== null && asString(v).trim() !== "") return v;
  }
  return undefined;
}

function requiredFieldsMissing(responses: Record<string, unknown>, requiredKeys: readonly BlueprintKey[]) {
  const missing: BlueprintKey[] = [];
  const present: BlueprintKey[] = [];
  for (const k of requiredKeys) {
    const v = pickField(responses, k);
    if (v === undefined || asString(v).trim() === "") missing.push(k);
    else present.push(k);
  }
  return { missing, present };
}

function parseRevenueRange(v: string): { raw: string; normalized?: string; annual_usd_min?: number; annual_usd_max?: number } {
  const raw = (v || "").trim();
  if (!raw) return { raw };

  // Best-effort normalization for common formats:
  // "$0-10k/mo", "10k-50k", "$1m-$5m", "under 100k", "7 figures", etc.
  const lower = raw.toLowerCase();

  const isMonthly = /\b\/\s*mo(nth)?\b|\bper\s*month\b|\bmonthly\b/.test(lower);
  const nums = lower
    .replace(/[,]/g, "")
    .match(/(\d+(\.\d+)?)(\s*(k|m|b))?/g);
  const values: number[] = [];
  if (nums) {
    for (const token of nums) {
      const m = token.match(/^(\d+(?:\.\d+)?)(?:\s*(k|m|b))?$/);
      if (!m) continue;
      let n = Number(m[1]);
      const unit = m[2];
      if (unit === "k") n *= 1_000;
      if (unit === "m") n *= 1_000_000;
      if (unit === "b") n *= 1_000_000_000;
      values.push(n);
    }
  }

  // "7 figures" etc
  if (!values.length) {
    const fig = lower.match(/(\d+)\s*figures?/);
    if (fig) {
      const f = Number(fig[1]);
      if (f === 6) values.push(100_000, 999_999);
      if (f === 7) values.push(1_000_000, 9_999_999);
      if (f === 8) values.push(10_000_000, 99_999_999);
      if (f === 9) values.push(100_000_000, 999_999_999);
    }
  }

  if (!values.length) return { raw };

  let min = values[0]!;
  let max = values.length >= 2 ? values[1]! : values[0]!;
  if (min > max) [min, max] = [max, min];

  if (/under|below|less\s+than|<\s*\$?\d/.test(lower)) {
    min = 0;
  }
  if (/over|above|more\s+than|>\s*\$?\d/.test(lower)) {
    max = 0;
  }

  // Convert monthly to annual.
  if (isMonthly) {
    min *= 12;
    max *= 12;
  }

  const annual_usd_min = Number.isFinite(min) ? Math.round(min) : undefined;
  const annual_usd_max = Number.isFinite(max) ? Math.round(max) : undefined;

  const normalized =
    annual_usd_min !== undefined && annual_usd_max !== undefined && annual_usd_max > 0
      ? `$${annual_usd_min.toLocaleString()}–$${annual_usd_max.toLocaleString()}/yr`
      : annual_usd_min !== undefined && annual_usd_max === 0
        ? `>$${annual_usd_min.toLocaleString()}/yr`
        : raw;

  return { raw, normalized, annual_usd_min, annual_usd_max: annual_usd_max === 0 ? undefined : annual_usd_max };
}

function parseMonthlyBudget(v: string): { raw: string; monthly_usd?: number } {
  const raw = (v || "").trim();
  if (!raw) return { raw };
  const lower = raw.toLowerCase().replace(/[,]/g, "");
  const m = lower.match(/(\d+(\.\d+)?)(\s*(k|m))?/);
  if (!m) return { raw };
  let n = Number(m[1]);
  const unit = m[4];
  if (unit === "k") n *= 1_000;
  if (unit === "m") n *= 1_000_000;
  if (!Number.isFinite(n) || n < 0) return { raw };
  return { raw, monthly_usd: Math.round(n) };
}

function computeWarnings(data: StructuredBlueprint): string[] {
  const warnings: string[] = [];

  const emailCheck = isValidEmail(data.email);
  if (!emailCheck.valid) warnings.push(`Email looks invalid (${emailCheck.reason}).`);

  const urlNorm = normalizeUrl(data.website_url);
  if (!urlNorm) warnings.push("Website URL is missing a valid hostname/protocol.");

  const emailDomain = data.email.includes("@") ? data.email.split("@")[1]!.toLowerCase() : "";
  const siteDomain = domainFromUrl(urlNorm || data.website_url);
  if (emailDomain && siteDomain && !FREE_EMAIL_DOMAINS.has(emailDomain) && emailDomain !== siteDomain) {
    warnings.push(`Email domain (${emailDomain}) does not match website domain (${siteDomain}).`);
  }
  if (emailDomain && FREE_EMAIL_DOMAINS.has(emailDomain)) warnings.push(`Email uses a free domain (${emailDomain}).`);

  const revenue = parseRevenueRange(data.revenue_range);
  if (revenue.annual_usd_min !== undefined) {
    if (revenue.annual_usd_min >= 1_000_000_000) warnings.push("Revenue range appears extremely high (>= $1B/yr).");
  }

  const budget = parseMonthlyBudget(data.monthly_budget);
  if (budget.monthly_usd !== undefined && budget.monthly_usd >= 250_000) {
    warnings.push("Monthly budget appears unusually high (>= $250k/mo).");
  }

  if (revenue.annual_usd_max !== undefined && budget.monthly_usd !== undefined) {
    const annualBudget = budget.monthly_usd * 12;
    if (annualBudget > revenue.annual_usd_max * 0.6) warnings.push("Marketing budget seems high relative to stated revenue.");
  }

  if (data.top_three_challenges.length > 3) warnings.push("Top three challenges contains more than three items.");

  return warnings;
}

type StructuredBlueprint = {
  client_name: string;
  email: string;
  whatsapp: string;
  website_url: string;
  industry: string;
  revenue_range: string;
  top_three_challenges: string[];
  competitors: string[];
  current_marketing_channels: string[];
  tools_in_use: string[];
  monthly_budget: string;
  success_goals: string[];
};

function structureBlueprint(responses: Record<string, unknown>): StructuredBlueprint {
  const get = (k: BlueprintKey) => asString(pickField(responses, k)).trim();

  const topThree = splitListish(get("top_three_challenges"));
  const structured: StructuredBlueprint = {
    client_name: get("client_name"),
    email: normalizeEmail(get("email")),
    whatsapp: normalizePhone(get("whatsapp")),
    website_url: normalizeUrl(get("website_url")) || get("website_url"),
    industry: get("industry"),
    revenue_range: get("revenue_range"),
    top_three_challenges: topThree,
    competitors: splitListish(get("competitors")),
    current_marketing_channels: splitListish(get("current_marketing_channels")),
    tools_in_use: splitListish(get("tools_in_use")),
    monthly_budget: get("monthly_budget"),
    success_goals: splitListish(get("success_goals")),
  };
  return structured;
}

const ValidateEmailInput = z.object({ email: z.string().min(1) });
const ValidateUrlInput = z.object({ url: z.string().min(1) });
const CheckFieldCompletionInput = z.object({
  responses: z.any(),
  required_fields: z.array(z.string()).optional(),
});
const StructureJsonOutputInput = z.object({
  responses: z.any(),
});
const FlagDataIssuesInput = z.object({
  structured: z.any(),
});

const server = new Server({ name: "blueprint-validator", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "validate-email",
        description: "Validate and normalize an email address.",
        inputSchema: zodToJsonSchema(ValidateEmailInput),
      },
      {
        name: "validate-url",
        description: "Validate and normalize a website URL (adds https:// if missing).",
        inputSchema: zodToJsonSchema(ValidateUrlInput),
      },
      {
        name: "check-field-completion",
        description:
          "Check whether required blueprint fields are present (supports flexible input shapes like {responses}, {fields}, or answers[]).",
        inputSchema: zodToJsonSchema(CheckFieldCompletionInput),
      },
      {
        name: "structure-json-output",
        description:
          "Validate presence of all blueprint fields and return a single structured JSON object + warnings array (throws if missing).",
        inputSchema: zodToJsonSchema(StructureJsonOutputInput),
      },
      {
        name: "flag-data-issues",
        description: "Return data quality warnings (suspicious domain mismatch, unrealistic revenue/budget, etc.).",
        inputSchema: zodToJsonSchema(FlagDataIssuesInput),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params ?? {};
  const obj = asObject(args) ?? {};

  if (name === "validate-email") {
    const parsed = ValidateEmailInput.parse(obj);
    const normalized = normalizeEmail(parsed.email);
    const verdict = isValidEmail(normalized);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ valid: verdict.valid, normalized, reason: verdict.reason ?? null }, null, 2),
        },
      ],
    };
  }

  if (name === "validate-url") {
    const parsed = ValidateUrlInput.parse(obj);
    const normalized = normalizeUrl(parsed.url);
    const valid = Boolean(normalized);
    const domain = normalized ? domainFromUrl(normalized) : "";
    return {
      content: [{ type: "text", text: JSON.stringify({ valid, normalized: normalized || null, domain: domain || null }, null, 2) }],
    };
  }

  if (name === "check-field-completion") {
    const parsed = CheckFieldCompletionInput.parse(obj);
    const responses = coerceResponses(parsed.responses);
    const required =
      parsed.required_fields?.length
        ? (parsed.required_fields.map((s) => normalizeKey(s)) as string[])
        : (RequiredBlueprintKeys as readonly string[]);

    // If caller supplied their own required list, we check them by raw key presence; otherwise we use blueprint pickers.
    if (parsed.required_fields?.length) {
      const norm = Object.fromEntries(Object.entries(responses).map(([k, v]) => [normalizeKey(k), v]));
      const missing = required.filter((k) => asString(norm[k]).trim() === "");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { ok: missing.length === 0, missing_fields: missing, present_count: required.length - missing.length, required_count: required.length },
              null,
              2,
            ),
          },
        ],
      };
    }

    const { missing, present } = requiredFieldsMissing(responses, RequiredBlueprintKeys);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { ok: missing.length === 0, missing_fields: missing, present_fields: present, required_count: RequiredBlueprintKeys.length },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "structure-json-output") {
    const parsed = StructureJsonOutputInput.parse(obj);
    const responses = coerceResponses(parsed.responses);
    const { missing } = requiredFieldsMissing(responses, RequiredBlueprintKeys);
    if (missing.length) {
      const message = `Missing required blueprint fields: ${missing.join(", ")}`;
      const err = new Error(message);
      (err as any).code = "MISSING_FIELDS";
      throw err;
    }

    const structured = structureBlueprint(responses);
    const warnings = computeWarnings(structured);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ...structured, warnings }, null, 2),
        },
      ],
    };
  }

  if (name === "flag-data-issues") {
    const parsed = FlagDataIssuesInput.parse(obj);
    const structuredObj = asObject(parsed.structured) ?? {};
    const structured = structuredObj as unknown as StructuredBlueprint;
    const warnings = computeWarnings(structured);
    return { content: [{ type: "text", text: JSON.stringify({ warnings }, null, 2) }] };
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

