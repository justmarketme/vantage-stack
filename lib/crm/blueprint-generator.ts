import type { Sql } from "postgres";
import type { WebsiteEnrichmentData } from "./website-enrichment";
import { getIndustryData } from "./industry-data";

// ─── Gemini AI enrichment ─────────────────────────────────────────────────────

async function generateAiInsights(p: BlueprintClientData, industryLabel: string, competitors: string[]): Promise<{
  executiveSummary: string;
  strategyNarrative: string;
  quickWins: string[];
} | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const prompt = `You are a senior digital marketing strategist for VantageStack, a South African revenue optimization agency.

Write a concise, insightful analysis for this client's blueprint document. Use professional but direct language. Be specific to their industry and situation. Do NOT use generic filler.

CLIENT PROFILE:
- Business: ${p.company || p.name}
- Industry: ${industryLabel}
- Revenue Range: ${p.revenue_range || "Not specified"}
- Website: ${p.website_url || "NONE — no web presence"}
- Monthly Budget: ${p.monthly_budget ? `R${p.monthly_budget.toLocaleString()}` : "Not specified"}
- Goals: ${p.success_goals || "Not specified"}
- Current Challenges: ${toStr(p.challenges) || "Not specified"}
- Current Marketing: ${p.current_marketing || "Not specified"}
- Tools Used: ${toStr(p.tools_used) || "None mentioned"}
- Key Competitors: ${competitors.join(", ") || "None identified"}

Respond with ONLY valid JSON in this exact structure (no markdown, no code blocks):
{
  "executiveSummary": "2-3 sentence executive summary that's specific to their business situation and biggest opportunity",
  "strategyNarrative": "3-4 sentence paragraph explaining the recommended digital strategy approach, tailored to their industry and challenges",
  "quickWins": ["specific actionable quick win 1", "specific actionable quick win 2", "specific actionable quick win 3", "specific actionable quick win 4"]
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 600 },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) return null;

    // Strip any markdown code fences if model added them
    const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

export type BlueprintClientData = {
  id: string;
  name: string;
  email?: string | null;
  company?: string | null;
  industry?: string | null;
  website_url?: string | null;
  whatsapp?: string | null;
  monthly_budget?: number | null;
  success_goals?: string | null;
  current_marketing?: string | null;
  challenges?: string[] | string | null;
  competitors?: string[] | string | null;
  tools_used?: string[] | string | null;
  revenue_range?: string | null;
};

function toStr(v: string[] | string | null | undefined): string {
  if (!v) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

function scoreLabel(score: number): string {
  if (score >= 90) return `${score}/100 ✅ Excellent`;
  if (score >= 50) return `${score}/100 ⚠️ Needs Improvement`;
  return `${score}/100 ❌ Poor`;
}

function msLabel(ms: number): string {
  if (ms < 2500) return `${(ms / 1000).toFixed(1)}s ✅`;
  if (ms < 4000) return `${(ms / 1000).toFixed(1)}s ⚠️`;
  return `${(ms / 1000).toFixed(1)}s ❌`;
}

function clsLabel(cls: number): string {
  if (cls <= 0.1) return `${cls} ✅`;
  if (cls <= 0.25) return `${cls} ⚠️`;
  return `${cls} ❌`;
}

type AiInsights = Awaited<ReturnType<typeof generateAiInsights>>;

export function buildBlueprintMarkdown(p: BlueprintClientData, enrichment?: WebsiteEnrichmentData, ai?: AiInsights): string {
  const industryData = getIndustryData(p.industry);
  const bm = industryData.benchmarks;

  // Resolve competitors: use provided ones, fall back to industry suggestions
  const providedCompetitors = toStr(p.competitors);
  const competitorList: string[] = providedCompetitors
    ? (Array.isArray(p.competitors) ? p.competitors : providedCompetitors.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))
    : industryData.competitors.slice(0, 4);
  const competitorsFromIndustry = !providedCompetitors;

  const hasWebsite = Boolean(p.website_url);
  const businessName = p.company || p.name;

  const lines: string[] = [];
  let n = 1; // dynamic section counter

  lines.push(`# VANTAGESTACK DIGITAL BLUEPRINT`);
  lines.push(`## ${p.name}${p.company ? ` — ${p.company}` : ""}`);
  lines.push(`Generated: ${new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}`);
  lines.push(``);

  // ── 1. Business Overview ──────────────────────────────────────────────────
  lines.push(`---`);
  lines.push(`## ${n++}. BUSINESS OVERVIEW`);
  lines.push(``);
  lines.push(`**Business Name:** ${businessName}`);
  lines.push(`**Industry:** ${p.industry || "—"}`);
  lines.push(`**Revenue Range:** ${p.revenue_range || "—"}`);
  lines.push(`**Website:** ${p.website_url || "❌ No website — significant opportunity gap"}`);
  lines.push(`**Contact:** ${p.email || "—"}${p.whatsapp ? ` | WhatsApp: ${p.whatsapp}` : ""}`);
  lines.push(``);

  lines.push(`> 💡 **Industry Opportunity:** Businesses in the ${industryData.label} sector with an optimised digital presence generate an estimated **${bm.missedRevenueEstimate}** in additional revenue annually. This blueprint identifies the gaps standing between ${businessName} and that potential.`);
  lines.push(``);

  // ── AI Executive Summary ──────────────────────────────────────────────────
  if (ai?.executiveSummary) {
    lines.push(`## ${n++}. EXECUTIVE SUMMARY`);
    lines.push(``);
    lines.push(ai.executiveSummary);
    lines.push(``);
  }

  if (p.success_goals) {
    lines.push(`## ${n++}. GOALS & OBJECTIVES`);
    lines.push(``);
    lines.push(toStr(p.success_goals as string));
    lines.push(``);
  }

  if (toStr(p.challenges)) {
    lines.push(`## ${n++}. CURRENT CHALLENGES`);
    lines.push(``);
    const list = Array.isArray(p.challenges) ? p.challenges : [p.challenges as string];
    list.forEach((c) => lines.push(`- ${c}`));
    lines.push(``);
  }

  // ── Competitor Landscape ───────────────────────────────────────────────────
  lines.push(`## ${n++}. COMPETITOR LANDSCAPE`);
  lines.push(``);
  if (competitorsFromIndustry) {
    lines.push(`*No specific competitors were listed. The following are leading players in the ${industryData.label} sector in South Africa:*`);
    lines.push(``);
  }
  competitorList.forEach((c) => lines.push(`- **${c}**`));
  lines.push(``);
  lines.push(`> ⚠️ These competitors are actively investing in digital marketing. The analysis below shows where ${businessName} currently stands relative to industry benchmarks.`);
  lines.push(``);

  // ── Industry Benchmark Comparison ─────────────────────────────────────────
  lines.push(`## ${n++}. INDUSTRY BENCHMARK COMPARISON`);
  lines.push(``);
  lines.push(`How ${businessName} compares to the ${industryData.label} sector average:`);
  lines.push(``);
  lines.push(`| Metric | Industry Average | ${businessName} |`);
  lines.push(`|--------|-----------------|${"-".repeat(businessName.length + 2)}|`);
  lines.push(`| Website Load Time | ${bm.avgWebsiteLoadTime} | ${hasWebsite ? "⏳ To be measured" : "❌ No website"} |`);
  lines.push(`| Avg. Conversion Rate | ${bm.avgConversionRate} | ❓ Not tracked |`);
  lines.push(`| Cost Per Lead | ${bm.avgCostPerLead} | ❓ Not measured |`);
  lines.push(`| Monthly Search Volume (industry) | ${bm.monthlySearchVolume} | ❓ Not capturing |`);
  lines.push(`| Avg. Leads/Month | ${bm.avgLeadsPerMonth} | ❓ Unknown |`);
  lines.push(``);
  lines.push(`> 📊 **Top channels competitors use:** ${bm.topChannels.join(", ")}`);
  lines.push(``);

  if (p.current_marketing) {
    lines.push(`## ${n++}. CURRENT MARKETING`);
    lines.push(``);
    lines.push(toStr(p.current_marketing as string));
    lines.push(``);
  }

  if (toStr(p.tools_used)) {
    lines.push(`## ${n++}. TOOLS & PLATFORMS IN USE`);
    lines.push(``);
    lines.push(toStr(p.tools_used));
    lines.push(``);
  }

  // ── Gap Analysis ───────────────────────────────────────────────────────────
  lines.push(`## ${n++}. DIGITAL GAP ANALYSIS`);
  lines.push(``);
  lines.push(`The following gaps have been identified based on your intake information and industry benchmarks:`);
  lines.push(``);

  if (!hasWebsite) {
    lines.push(`### ❌ Critical: No Website`);
    lines.push(`${businessName} has no web presence. In the ${industryData.label} sector, ${bm.avgConversionRate} of website visitors convert to leads. At the industry average of ${bm.avgLeadsPerMonth} leads/month (valued at ${bm.avgRevenuePerLead} each), this gap represents a significant revenue opportunity.`);
    lines.push(``);
  }

  lines.push(`### Content & SEO Gaps`);
  bm.contentGaps.forEach((g) => lines.push(`- ❌ ${g}`));
  lines.push(``);

  lines.push(`### Tracking & Measurement`);
  lines.push(`- ❌ No confirmed analytics setup (GA4 / Google Tag Manager)`);
  lines.push(`- ❌ No conversion tracking — unable to measure ROI`);
  lines.push(`- ❌ No retargeting pixel installed`);
  lines.push(`- ❌ No heatmap or session recording tool`);
  lines.push(``);

  lines.push(`### Lead Generation`);
  lines.push(`- ❌ No lead magnet or free resource offering`);
  lines.push(`- ❌ No email nurture sequence for new leads`);
  lines.push(`- ❌ No WhatsApp Business integration for instant follow-up`);
  lines.push(``);

  // ── Strategy Recommendations ───────────────────────────────────────────────
  lines.push(`## ${n++}. DIGITAL STRATEGY RECOMMENDATIONS`);
  lines.push(``);
  lines.push(`Based on your business profile and the gaps above, VantageStack recommends:`);
  lines.push(``);

  if (!hasWebsite) {
    lines.push(`### Priority 1: Build a Converting Website`);
    lines.push(`Without a website, ${businessName} is invisible online. Competitors are capturing all organic and paid search traffic. A professionally built, fast-loading site is the foundation of every other strategy.`);
    lines.push(`- Mobile-first design optimised for ${industryData.label}`);
    lines.push(`- Clear value proposition + lead capture on homepage`);
    lines.push(`- Contact forms, WhatsApp click-to-chat, and call tracking`);
    lines.push(`- SEO-optimised structure from day one`);
    lines.push(``);
  }

  lines.push(`### ${hasWebsite ? "Priority 1" : "Priority 2"}: Paid Advertising`);
  lines.push(`- **Google Ads:** Target high-intent searches in the ${industryData.label} space`);
  lines.push(`- **Meta Ads:** Build brand awareness + retarget website visitors`);
  lines.push(`- **Estimated cost per lead:** ${bm.avgCostPerLead} (industry benchmark)`);
  lines.push(`- **Recommended monthly ad spend:** ${p.monthly_budget ? `R${p.monthly_budget.toLocaleString()}` : "R5,000–R15,000 to start"}`);
  lines.push(``);
  lines.push(`### ${hasWebsite ? "Priority 2" : "Priority 3"}: SEO & Content`);
  lines.push(`- Target high-intent keywords for the ${p.industry || "your"} industry`);
  lines.push(`- Monthly search volume opportunity: ${bm.monthlySearchVolume} searches/month`);
  lines.push(`- Develop a content strategy around your ideal customer's questions`);
  lines.push(`- ${bm.topChannels.includes("LinkedIn") ? "LinkedIn thought leadership to reach B2B decision-makers" : "Social media content calendar aligned to your audience"}`);
  lines.push(``);
  lines.push(`### ${hasWebsite ? "Priority 3" : "Priority 4"}: Analytics & Tracking Setup`);
  lines.push(`- Install GA4 + Google Tag Manager`);
  lines.push(`- Set up conversion goals and funnel tracking`);
  lines.push(`- Facebook Pixel + Google Ads conversion tracking`);
  lines.push(`- Monthly performance dashboard delivered to you`);
  lines.push(``);

  // AI strategy narrative + quick wins
  if (ai?.strategyNarrative) {
    lines.push(`### Strategic Context`);
    lines.push(ai.strategyNarrative);
    lines.push(``);
  }
  if (ai?.quickWins?.length) {
    lines.push(`### ⚡ Quick Wins (First 30 Days)`);
    ai.quickWins.forEach((w) => lines.push(`- ${w}`));
    lines.push(``);
  }

  // ── Enrichment sections (only when live data is available) ──────────────
  if (enrichment) {
    // Website Performance Audit
    if (enrichment.pageSpeed || enrichment.seoSignals || enrichment.whois) {
      lines.push(`## ${n++}. WEBSITE AUDIT REPORT`);
      lines.push(`*Audited: ${new Date(enrichment.scrapedAt).toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}*`);
      lines.push(``);

      if (enrichment.pageSpeed) {
        const { mobile, desktop, opportunities } = enrichment.pageSpeed;
        lines.push(`### Performance Scores`);
        if (mobile) {
          lines.push(`| Metric | Mobile |`);
          lines.push(`|--------|--------|`);
          lines.push(`| Performance Score | ${scoreLabel(mobile.score)} |`);
          lines.push(`| Largest Contentful Paint (LCP) | ${msLabel(mobile.lcp)} |`);
          lines.push(`| Cumulative Layout Shift (CLS) | ${clsLabel(mobile.cls)} |`);
          lines.push(`| Total Blocking Time (TBT) | ${msLabel(mobile.tbt)} |`);
        }
        if (desktop) {
          lines.push(``);
          lines.push(`| Metric | Desktop |`);
          lines.push(`|--------|---------|`);
          lines.push(`| Performance Score | ${scoreLabel(desktop.score)} |`);
          lines.push(`| Largest Contentful Paint (LCP) | ${msLabel(desktop.lcp)} |`);
          lines.push(`| Cumulative Layout Shift (CLS) | ${clsLabel(desktop.cls)} |`);
          lines.push(`| Total Blocking Time (TBT) | ${msLabel(desktop.tbt)} |`);
        }
        if (opportunities.length) {
          lines.push(``);
          lines.push(`### Top Performance Improvements`);
          opportunities.forEach((o) => lines.push(`- ${o}`));
        }
        lines.push(``);
      }

      if (enrichment.seoSignals) {
        const s = enrichment.seoSignals;
        lines.push(`### Technical SEO Signals`);
        lines.push(`| Signal | Status |`);
        lines.push(`|--------|--------|`);
        lines.push(`| HTTPS / SSL | ${s.isHttps ? "✅ Secure" : "❌ Not secure (HTTP only)"} |`);
        lines.push(`| Page Title | ${s.hasTitle ? `✅ Present: "${s.titleText.slice(0, 60)}"` : "❌ Missing"} |`);
        lines.push(`| Meta Description | ${s.hasMetaDescription ? `✅ Present: "${s.metaDescription.slice(0, 80)}"` : "❌ Missing"} |`);
        lines.push(`| H1 Heading | ${s.h1s.length ? `✅ Found: "${s.h1s[0].slice(0, 60)}"` : "❌ Missing"} |`);
        lines.push(`| Canonical Tag | ${s.hasCanonical ? "✅ Present" : "⚠️ Not found"} |`);
        lines.push(`| Schema Markup | ${s.hasSchema ? "✅ Structured data found" : "⚠️ No schema markup"} |`);
        lines.push(`| Open Graph Tags | ${s.hasOgTags ? "✅ Present (social sharing ready)" : "⚠️ Missing"} |`);
        lines.push(`| robots.txt | ${s.hasRobotsTxt ? "✅ Present" : "⚠️ Not found"} |`);
        lines.push(`| Sitemap.xml | ${s.hasSitemap ? "✅ Present" : "⚠️ Not found"} |`);
        if (s.techStack.length) {
          lines.push(``);
          lines.push(`### Detected Technologies`);
          lines.push(s.techStack.join(" · "));
        }
        lines.push(``);
      }

      if (enrichment.whois) {
        const w = enrichment.whois;
        lines.push(`### Domain Information`);
        lines.push(`| Field | Detail |`);
        lines.push(`|-------|--------|`);
        lines.push(`| Domain | ${w.domainName} |`);
        if (w.registrar) lines.push(`| Registrar | ${w.registrar} |`);
        if (w.createdDate) lines.push(`| Registered | ${w.createdDate.slice(0, 10)} |`);
        if (w.expiresDate) lines.push(`| Expires | ${w.expiresDate.slice(0, 10)} |`);
        if (w.ageYears !== null) lines.push(`| Domain Age | ${w.ageYears} year${w.ageYears !== 1 ? "s" : ""} |`);
        if (w.status) lines.push(`| Status | ${w.status} |`);
        lines.push(``);
      }
    }

    // Online Authority
    if (enrichment.openPageRank) {
      const opr = enrichment.openPageRank;
      lines.push(`## ${n++}. ONLINE AUTHORITY`);
      lines.push(``);
      lines.push(`**Open PageRank Score:** ${opr.score.toFixed(1)} / 10 — ${opr.rank}`);
      lines.push(``);
      if (opr.score < 3) {
        lines.push(`> ⚠️ This domain has low authority. Building a backlink strategy and publishing consistent content are high-priority actions to improve search rankings.`);
      } else if (opr.score < 6) {
        lines.push(`> ℹ️ Moderate domain authority. There is meaningful room to grow through targeted content marketing and earning quality backlinks.`);
      } else {
        lines.push(`> ✅ Strong domain authority. Leverage this with targeted keyword campaigns and conversion rate optimisation.`);
      }
      lines.push(``);
    }

    // Paid Advertising Status
    if (enrichment.metaAds !== null) {
      lines.push(`## ${n++}. PAID ADVERTISING STATUS`);
      lines.push(``);
      const ads = enrichment.metaAds;
      if (ads.activeAds > 0) {
        lines.push(`**Meta/Facebook Ads:** ✅ Currently running (${ads.activeAds} active ad${ads.activeAds !== 1 ? "s" : ""} found)`);
        if (ads.categories.length) lines.push(`**Platforms:** ${ads.categories.join(", ")}`);
        lines.push(``);
        lines.push(`> ℹ️ This business is already investing in paid social. VantageStack can audit existing campaigns, reduce cost-per-lead, and layer in retargeting and lookalike audiences.`);
      } else {
        lines.push(`**Meta/Facebook Ads:** ❌ No active ads detected`);
        lines.push(``);
        lines.push(`> 💡 This business is not currently running paid social ads. This represents a significant growth lever — Meta Ads can be one of the fastest ways to generate leads in the ${p.industry || "target"} market.`);
      }
      lines.push(``);
    }
  }
  // ── End enrichment sections ───────────────────────────────────────────

  lines.push(`## ${n++}. NEXT STEPS`);
  lines.push(``);
  lines.push(`1. Review this blueprint with your VantageStack account manager`);
  lines.push(`2. Approve the recommended strategy and budget`);
  lines.push(`3. Sign the service agreement`);
  lines.push(`4. Onboarding call scheduled within 48 hours of sign-off`);
  lines.push(``);
  lines.push(`---`);
  lines.push(`*This blueprint was prepared exclusively for ${p.company || p.name} by VantageStack.*`);
  lines.push(`*All information is confidential and proprietary.*`);

  return lines.join("\n");
}

/**
 * Generates and persists a blueprint for a client in the blueprint_markdown column.
 * Idempotent — safe to call on re-submit.
 */
export async function generateAndSaveBlueprint(db: Sql, clientData: BlueprintClientData, enrichment?: WebsiteEnrichmentData): Promise<string> {
  // Generate AI insights in parallel with any enrichment already provided
  const industryData = getIndustryData(clientData.industry);
  const providedCompetitors = toStr(clientData.competitors);
  const competitorList: string[] = providedCompetitors
    ? (Array.isArray(clientData.competitors) ? clientData.competitors : providedCompetitors.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))
    : industryData.competitors.slice(0, 4);

  const ai = await generateAiInsights(clientData, industryData.label, competitorList);

  const markdown = buildBlueprintMarkdown(clientData, enrichment, ai);

  await db`
    update public.clients
    set blueprint_markdown = ${markdown}
    where id = ${clientData.id}::uuid
  `;

  return markdown;
}
