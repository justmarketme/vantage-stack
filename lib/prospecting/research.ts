import type { Sql } from "postgres";
import type { ConfidenceFlag, Prospect } from "./types";
import { updateProspect } from "./service";

interface ResearchResult {
  business_verified: boolean;
  website_found: string | null;
  social_profiles: Record<string, string>;
  company_size_estimate: string | null;
  trading_duration: string | null;
  uses_ai_tools: boolean;
  competitor_risk: boolean;
  repeated_pain_pattern: boolean;
  confidence_flag: ConfidenceFlag;
  findings: Record<string, unknown>;
}

const COMPETITOR_KEYWORDS = [
  "digital agency", "web agency", "marketing agency", "seo agency",
  "we build websites", "we offer automation", "our agency",
  "dm me for", "link in bio", "check out our",
];

export function assessCompetitorRisk(texts: string[]): boolean {
  const combined = texts.join(" ").toLowerCase();
  return COMPETITOR_KEYWORDS.some((kw) => combined.includes(kw));
}

export function scoreConfidence(result: Partial<ResearchResult>): ConfidenceFlag {
  let score = 50;

  if (result.business_verified) score += 20;
  if (result.website_found) score += 10;
  if (Object.keys(result.social_profiles ?? {}).length > 0) score += 10;
  if (result.trading_duration) score += 5;
  if (result.repeated_pain_pattern) score += 10;

  if (result.competitor_risk) score -= 40;
  if (result.uses_ai_tools) score -= 10;

  if (score >= 70) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

export async function checkWebPresence(businessName: string): Promise<{
  website: string | null;
  socials: Record<string, string>;
}> {
  const socials: Record<string, string> = {};
  let website: string | null = null;

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(businessName + " South Africa")}`;
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VantageStackBot/1.0)" },
      signal: AbortSignal.timeout(10_000),
    });
    const html = await res.text();

    const urlMatch = html.match(/href="(https?:\/\/(?!www\.google|maps\.google)[^"]+)"/);
    if (urlMatch) website = urlMatch[1];

    const fbMatch = html.match(/facebook\.com\/[a-zA-Z0-9._-]+/);
    if (fbMatch) socials.facebook = `https://${fbMatch[0]}`;

    const igMatch = html.match(/instagram\.com\/[a-zA-Z0-9._-]+/);
    if (igMatch) socials.instagram = `https://${igMatch[0]}`;

    const liMatch = html.match(/linkedin\.com\/(?:company|in)\/[a-zA-Z0-9._-]+/);
    if (liMatch) socials.linkedin = `https://${liMatch[0]}`;
  } catch {
    // Web presence check is best-effort
  }

  return { website, socials };
}

export async function researchProspect(
  db: Sql,
  prospect: Prospect,
): Promise<ResearchResult> {
  const findings: Record<string, unknown> = {};

  // 1. Check web presence
  const searchTarget = prospect.business_name || prospect.name || "";
  const webPresence = searchTarget
    ? await checkWebPresence(searchTarget)
    : { website: null, socials: {} };

  findings.web_presence = webPresence;

  // 2. Check for competitor risk from source text
  const textsToCheck = [prospect.source_text];
  const competitorRisk = assessCompetitorRisk(textsToCheck);
  findings.competitor_risk = competitorRisk;

  // 3. Check if they mention AI/automation tools already
  const aiKeywords = ["chatgpt", "zapier", "make.com", "hubspot", "salesforce", "pipedrive", "freshworks", "zoho crm"];
  const usesAi = aiKeywords.some((kw) => prospect.source_text.toLowerCase().includes(kw));
  findings.uses_ai_tools = usesAi;

  // 4. Repeated pain pattern detection — check if we've seen similar posts from same source
  const [repeats] = await db`
    select count(*) as cnt from public.prospects
    where business_name = ${prospect.business_name ?? ""}
      and business_name is not null
      and business_name != ''
      and id != ${prospect.id}
  `;
  const repeatedPain = Number(repeats?.cnt ?? 0) > 0;
  findings.repeated_pain = repeatedPain;

  const result: ResearchResult = {
    business_verified: !!webPresence.website || Object.keys(webPresence.socials).length >= 2,
    website_found: prospect.website_url || webPresence.website,
    social_profiles: { ...prospect.social_profiles, ...webPresence.socials },
    company_size_estimate: prospect.company_size_estimate,
    trading_duration: null,
    uses_ai_tools: usesAi,
    competitor_risk: competitorRisk,
    repeated_pain_pattern: repeatedPain,
    confidence_flag: "yellow",
    findings,
  };

  result.confidence_flag = scoreConfidence(result);

  // Persist findings
  await updateProspect(db, prospect.id, {
    confidence_flag: result.confidence_flag,
    website_url: result.website_found ?? prospect.website_url,
    social_profiles: result.social_profiles,
    research_findings: result.findings,
  });

  return result;
}
