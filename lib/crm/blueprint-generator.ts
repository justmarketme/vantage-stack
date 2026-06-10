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

  const previousVendors = (p.previous_vendor_exp || []).join(", ") || "None";
  const vendorFraming = previousVendors !== "None"
    ? `\n\nIMPORTANT: This client has previously worked with digital marketing or SEO agencies (${previousVendors}). Frame VantageStack's approach as fundamentally different — we engineer revenue systems, not just run campaigns.`
    : "";

  const prompt = `You are a senior digital marketing strategist for VantageStack, a South African revenue optimization agency.

Write a concise, insightful analysis for this client's blueprint document. Use professional but direct language. Be specific to their industry and situation. Do NOT use generic filler.

CLIENT PROFILE:
- Business: ${p.company || p.name}
- Industry: ${industryLabel}
- Sub-niche: ${p.sub_niche || "Not specified"}
- Revenue Range: ${p.revenue_range || "Not specified"}
- Website: ${p.website_url || "NONE — no web presence"}
- Monthly Budget: ${p.monthly_budget ? `R${p.monthly_budget.toLocaleString()}` : "Not specified"}
- Goals: ${p.success_goals || "Not specified"}
- Current Challenges: ${toStr(p.challenges) || "Not specified"}
- Current Marketing: ${p.current_marketing || "Not specified"}
- Tools Used: ${toStr(p.tools_used) || "None mentioned"}
- Key Competitors: ${competitors.join(", ") || "None identified"}
- Social Platforms: ${[p.social_instagram && "Instagram", p.social_tiktok && "TikTok", p.social_facebook && "Facebook", p.social_x && "X/Twitter", p.social_youtube && "YouTube"].filter(Boolean).join(", ") || "None provided"}
- Current conversion rate: ${p.conversion_rate || "Not measured"}
- Speed to first contact: ${p.speed_to_contact || "Not specified"}
- Timeline to get started: ${p.urgency_timeline || "Not specified"}
- Previous vendor experience: ${previousVendors}
- Hours lost per week to manual tasks: ${p.hours_lost_per_week || "Not specified"}${vendorFraming}

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
  social_instagram?: string | null;
  social_tiktok?: string | null;
  social_facebook?: string | null;
  social_x?: string | null;
  social_youtube?: string | null;
  social_insights?: import("./social-scraper").SocialInsight[] | null;
  sub_niche?: string | null;
  conversion_rate?: string | null;
  speed_to_contact?: string | null;
  urgency_timeline?: string | null;
  serve_area?: string | null;
  hours_lost_per_week?: string | null;
  biggest_frustration?: string | null;
  previous_vendor_exp?: string[] | null;
  primary_intent?: string | null;
  enquiry_volume?: string | null;
  follow_up_method?: string | null;
  missed_call_handling?: string | null;
  current_website_status?: string | null;
  google_maps_status?: string | null;
  website_goal?: string[] | null;
  biggest_time_waste?: string[] | null;
  team_size?: string | null;
  package_preference?: string | null;
  website_exists?: string | null;
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

  const hasWebsiteUrl = Boolean(p.website_url);
  const hasWebsite = p.website_exists !== "No — I need one built" &&
    (hasWebsiteUrl || (p.current_website_status !== "No — I need one built from scratch"));
  const businessName = p.company || p.name;

  const lines: string[] = [];
  let n = 1; // dynamic section counter

  lines.push(`# VANTAGESTACK DIGITAL BLUEPRINT`);
  lines.push(`## ${p.name}${p.company ? ` — ${p.company}` : ""}`);
  lines.push(`Generated: ${new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" })}`);
  lines.push(``);

  // ── Executive Summary FIRST ───────────────────────────────────────────────
  lines.push(`---`);
  lines.push(`## ${n++}. EXECUTIVE SUMMARY`);
  lines.push(``);

  // Derive situation gap from primary_intent
  const gapLabel: string = (() => {
    switch (p.primary_intent) {
      case "LEADS": return "a lead conversion gap";
      case "PRESENCE": return "limited online visibility";
      case "AUTOMATION": return "operational inefficiency";
      case "EXPLORE": return "unclear growth direction";
      default: return "an identified growth gap";
    }
  })();

  const areaStr = p.serve_area ? ` in ${p.serve_area}` : "";
  const industryOrNiche = p.sub_niche || p.industry || "their sector";

  lines.push(`**The Situation:** ${businessName} is a ${industryOrNiche} business${areaStr} currently facing ${gapLabel}.`);
  lines.push(``);

  // Biggest gap — derive from actual answers
  const biggestGapParts: string[] = [];
  if (p.conversion_rate && p.conversion_rate !== "I don't track this") {
    biggestGapParts.push(`Converting only ${p.conversion_rate} out of every 10 enquiries into paying clients`);
  }
  if (p.speed_to_contact && /next day|later/i.test(p.speed_to_contact)) {
    biggestGapParts.push(`Responding to enquiries next day or later, when competitors respond within 5 minutes`);
  }
  if (biggestGapParts.length > 0) {
    lines.push(`**The Biggest Gap:** ${biggestGapParts.join("; ")}.`);
  } else if (p.biggest_frustration) {
    lines.push(`**The Biggest Gap:** ${p.biggest_frustration}`);
  }
  lines.push(``);

  // Opportunity — use sub-niche benchmark if available
  const subNicheBenchmark = p.sub_niche && industryData.subNicheBenchmarks?.[p.sub_niche];
  if (subNicheBenchmark) {
    lines.push(`**The Opportunity:** Businesses in ${p.sub_niche} that fix their lead follow-up see an average 40–60% increase in conversion within 90 days. The average deal size in this niche is ${subNicheBenchmark.avgDealSize}.`);
  } else {
    lines.push(`**The Opportunity:** Businesses in ${industryOrNiche} that address these gaps typically see a 40–60% improvement in qualified lead conversion within the first 90 days of implementation.`);
  }
  lines.push(``);

  // AI-generated executive summary appended if available
  if (ai?.executiveSummary) {
    lines.push(ai.executiveSummary);
    lines.push(``);
  }

  // ── 2. Business Overview ──────────────────────────────────────────────────
  lines.push(`---`);
  lines.push(`## ${n++}. BUSINESS OVERVIEW`);
  lines.push(``);
  lines.push(`**Business Name:** ${businessName}`);
  lines.push(`**Industry:** ${p.industry || "—"}${p.sub_niche ? ` / ${p.sub_niche}` : ""}`);
  lines.push(`**Revenue Range:** ${p.revenue_range || "—"}`);
  lines.push(`**Website:** ${p.website_url || "❌ No website — significant opportunity gap"}`);
  lines.push(`**Contact:** ${p.email || "—"}${p.whatsapp ? ` | WhatsApp: ${p.whatsapp}` : ""}`);
  lines.push(``);

  lines.push(`> 💡 **Industry Opportunity:** Businesses in the ${industryData.label} sector with an optimised digital presence generate an estimated **${bm.missedRevenueEstimate}** in additional revenue annually. This blueprint identifies the gaps standing between ${businessName} and that potential.`);
  lines.push(``);

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

  // ── Social Media Presence ─────────────────────────────────────────────────
  const socialPlatforms = [
    { key: "instagram", label: "Instagram", value: p.social_instagram },
    { key: "tiktok",    label: "TikTok",    value: p.social_tiktok },
    { key: "facebook",  label: "Facebook",  value: p.social_facebook },
    { key: "x",         label: "X/Twitter", value: p.social_x },
    { key: "youtube",   label: "YouTube",   value: p.social_youtube },
  ].filter((s) => s.value);

  if (socialPlatforms.length > 0 || p.social_insights?.length) {
    lines.push(`## ${n++}. SOCIAL MEDIA PRESENCE`);
    lines.push(``);
    if (socialPlatforms.length) {
      lines.push(`**Active Platforms:**`);
      socialPlatforms.forEach((s) => lines.push(`- **${s.label}:** ${s.value}`));
      lines.push(``);
    }
    if (p.social_insights?.length) {
      const insights = p.social_insights;
      const totalFollowers = insights.reduce((sum, i) => sum + (i.followers ?? 0), 0);
      const avgEng = insights.filter((i) => i.engagementRate !== null);
      const avgEngRate = avgEng.length
        ? (avgEng.reduce((s, i) => s + i.engagementRate!, 0) / avgEng.length).toFixed(2)
        : null;

      lines.push(`**Audience Intelligence (scraped):**`);
      lines.push(`- Combined reach: **${totalFollowers.toLocaleString()} followers** across ${insights.length} platform(s)`);
      if (avgEngRate) lines.push(`- Average engagement rate: **${avgEngRate}%**`);
      lines.push(``);
      for (const ins of insights) {
        lines.push(`**${ins.platform.charAt(0).toUpperCase() + ins.platform.slice(1)}** — @${ins.handle}`);
        if (ins.followers !== null) lines.push(`- Followers: ${ins.followers.toLocaleString()}`);
        if (ins.engagementRate !== null) lines.push(`- Engagement: ${ins.engagementRate}%`);
        if (ins.postingFrequency) lines.push(`- Frequency: ${ins.postingFrequency}`);
        if (ins.topHashtags.length) lines.push(`- Top hashtags: ${ins.topHashtags.slice(0, 5).join(", ")}`);
        if (ins.contentThemes.length) lines.push(`- Content themes: ${ins.contentThemes.slice(0, 3).join(", ")}`);
        lines.push(``);
      }
      lines.push(`> 💡 **Design implication:** The brand's tone, colour palette, and content style observed across social media should be carried through to the website and campaign assets for audience consistency.`);
      lines.push(``);
    }
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

  const clientConversionRate = p.conversion_rate && p.conversion_rate !== "I don't track this"
    ? p.conversion_rate + " per 10 enquiries"
    : "❓ Not measured";

  const enquiryVolume = p.enquiry_volume;
  const clientLeadsPerMonth = enquiryVolume
    ? `~${enquiryVolume} (reported)`
    : "❓ Not tracked";

  lines.push(`| Metric | Industry Average | ${businessName} |`);
  lines.push(`|--------|-----------------|${"-".repeat(businessName.length + 2)}|`);
  lines.push(`| Website Load Time | ${bm.avgWebsiteLoadTime} | ${hasWebsiteUrl ? "⏳ To be measured" : "❌ No website"} |`);
  lines.push(`| Avg. Conversion Rate | ${bm.avgConversionRate} | ${clientConversionRate} |`);
  lines.push(`| Cost Per Lead | ${bm.avgCostPerLead} | ❓ Not measured |`);
  lines.push(`| Monthly Search Volume (industry) | ${bm.monthlySearchVolume} | ❓ Not capturing |`);
  lines.push(`| Avg. Leads/Month | ${bm.avgLeadsPerMonth} | ${clientLeadsPerMonth} |`);
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

  // Conditional gap flags
  const gapFlags: string[] = [];

  // GA4/GTM — only if website exists and no analytics detected
  const enrichmentTechStack: string[] = enrichment?.seoSignals?.techStack ?? [];
  const hasAnalytics = (p.tools_used as string[] | null || []).some((t) => /ga4|gtm|google tag|analytics/i.test(t))
    || enrichmentTechStack.some((t) => /ga4|gtm|google tag|analytics/i.test(t));
  if (hasWebsite && !hasAnalytics) {
    gapFlags.push("❌ No GA4/GTM analytics — you're flying blind on what's working");
  }

  // Conversion tracking
  if (p.conversion_rate === "I don't track this") {
    gapFlags.push("❌ No conversion tracking — you can't improve what you don't measure");
  }

  // Retargeting pixel
  const hasPixel = (p.tools_used as string[] | null || []).some((t) => /pixel|retarget|facebook ads|meta ads/i.test(t))
    || enrichmentTechStack.some((t) => /pixel|meta|facebook/i.test(t));
  if (hasWebsite && !hasPixel) {
    gapFlags.push("❌ No retargeting pixel — visitors leave and you can't bring them back");
  }

  // Heatmap
  const hasHeatmap = (p.tools_used as string[] | null || []).some((t) => /hotjar|clarity|heatmap|mouseflow/i.test(t));
  if (hasWebsite && !hasHeatmap) {
    gapFlags.push("❌ No heatmap tool — you don't know where visitors are dropping off");
  }

  // Lead magnet — only for LEADS path
  if (p.primary_intent === "LEADS" && (!p.follow_up_method || /inconsistent|we don't|manual/i.test(p.follow_up_method || ""))) {
    gapFlags.push("❌ No lead magnet or automated follow-up sequence");
  }

  // Email nurture
  if (/inconsistent|we don't|manual|no system/i.test(p.follow_up_method || "")) {
    gapFlags.push("❌ No email nurture sequence — leads go cold after the first contact");
  }

  // WhatsApp Business
  const hasWhatsAppBusiness = (p.tools_used as string[] | null || []).some((t) => /whatsapp business/i.test(t));
  if (!hasWhatsAppBusiness && /inconsistent|manual|we don't/i.test(p.follow_up_method || "")) {
    gapFlags.push("❌ No WhatsApp Business integration — missing the highest-engagement channel in SA");
  }

  // Content/SEO — only if client has a website
  if (hasWebsite && p.primary_intent !== "AUTOMATION") {
    gapFlags.push("📉 Content & SEO gaps identified — see website analysis below");
  }

  if (gapFlags.length === 0) {
    gapFlags.push("✅ No critical gaps identified in current toolset — focus is on optimisation and scale");
  }

  gapFlags.forEach((flag) => {
    lines.push(`- ${flag}`);
    // Add loss aversion framing for response speed gap
    if (flag.includes("No GA4/GTM")) {
      lines.push(`  *Without analytics, every rand spent on marketing is untracked — you can't double down on what works or cut what doesn't.*`);
    }
    if (flag.includes("No conversion tracking")) {
      lines.push(`  *You can't improve what you don't measure — every untracked enquiry is an invisible leak in your revenue pipeline.*`);
    }
    if (flag.includes("No retargeting pixel")) {
      lines.push(`  *Up to 97% of website visitors leave without converting. Without a pixel, they're gone forever — competitors with retargeting keep showing up until they buy.*`);
    }
    if (flag.includes("No email nurture")) {
      lines.push(`  *Most prospects need 5–7 touchpoints before they buy. Without a nurture sequence, you're leaving the sale to chance.*`);
    }
    if (flag.includes("No WhatsApp Business")) {
      lines.push(`  *WhatsApp has a 98% open rate vs 20% for email. Every day without it is a day competitors use it to close your leads.*`);
    }
  });

  // Response time loss aversion (standalone if speed_to_contact indicates slow response)
  if (p.speed_to_contact && /next day|later/i.test(p.speed_to_contact)) {
    lines.push(``);
    lines.push(`> ⏱️ **Response Speed Risk:** At next-day response times, you're statistically losing 8 out of 9 qualified leads to competitors who respond faster. *Studies show businesses that respond within 5 minutes are 21× more likely to qualify a lead than those who respond the next day.*`);
  }

  lines.push(``);

  // ── Path-specific analysis ─────────────────────────────────────────────────
  if (p.primary_intent === "LEADS") {
    lines.push(`## ${n++}. LEAD CONVERSION ANALYSIS`);
    lines.push(``);

    const enquiryVolumeVal = p.enquiry_volume;
    const monthlyEstimate = enquiryVolumeVal ? `~${enquiryVolumeVal} (reported)` : "Not tracked";

    lines.push(`| Metric | Your Numbers |`);
    lines.push(`|--------|-------------|`);
    lines.push(`| Enquiries per month | ${monthlyEstimate} |`);
    lines.push(`| Current conversion rate | ${p.conversion_rate || "Not measured"} |`);
    lines.push(`| Response speed | ${p.speed_to_contact || "Not specified"} |`);
    lines.push(`| Follow-up method | ${p.follow_up_method || "Not described"} |`);
    lines.push(``);

    lines.push(`**Revenue at Risk:**`);
    if (p.conversion_rate && /1[-–]2|^1$|^2$/i.test(p.conversion_rate)) {
      lines.push(`At 1–2 conversions per 10 enquiries, you're losing 8 potential clients for every 10 who reach out. If your average deal is R5,000+, that's significant monthly revenue walking out the door.`);
    }
    if (p.speed_to_contact && /next day|later/i.test(p.speed_to_contact)) {
      lines.push(`Studies show businesses that respond within 5 minutes are 21× more likely to qualify a lead than those who respond the next day.`);
    }
    lines.push(``);
  }

  if (p.primary_intent === "PRESENCE") {
    lines.push(`## ${n++}. ONLINE VISIBILITY ANALYSIS`);
    lines.push(``);
    lines.push(`| Signal | Status |`);
    lines.push(`|--------|--------|`);
    lines.push(`| Website | ${p.current_website_status || (p.website_url ? p.website_url : "Not specified")} |`);
    lines.push(`| Google Maps / GMB | ${p.google_maps_status || "Not specified"} |`);
    lines.push(`| Serve area | ${p.serve_area || "Not specified"} |`);
    lines.push(``);
  }

  if (p.primary_intent === "AUTOMATION") {
    lines.push(`## ${n++}. OPERATIONAL EFFICIENCY ANALYSIS`);
    lines.push(``);
    lines.push(`| Factor | Details |`);
    lines.push(`|--------|---------|`);
    lines.push(`| Biggest time drains | ${p.biggest_time_waste?.join(", ") || "Not specified"} |`);
    lines.push(`| Hours lost per week | ${p.hours_lost_per_week || "Not specified"} |`);
    lines.push(`| Tools currently used | ${toStr(p.tools_used) || "None mentioned"} |`);
    lines.push(`| Team size | ${p.team_size || "Not specified"} |`);
    lines.push(``);

    if (p.hours_lost_per_week) {
      const hoursMatch = p.hours_lost_per_week.match(/\d+/);
      const weeklyHours = hoursMatch ? parseInt(hoursMatch[0], 10) : null;
      if (weeklyHours) {
        const annualHours = weeklyHours * 52;
        lines.push(`**Cost of Inaction:**`);
        lines.push(`At ${p.hours_lost_per_week} lost per week, your team is spending approximately ${annualHours} hours per year on tasks that could be automated — time that could go toward revenue-generating activities.`);
        lines.push(``);
      }
    }
  }

  if (p.primary_intent === "EXPLORE") {
    lines.push(`## ${n++}. BUSINESS GROWTH OPPORTUNITY`);
    lines.push(``);
    const frustration = p.biggest_frustration || "your current growth challenges";
    let recommendedPackage = "a tailored growth package";
    if (frustration && /lead|enquir|client|sale/i.test(frustration)) {
      recommendedPackage = "the LEADS conversion package";
    } else if (frustration && /website|online|visible|find/i.test(frustration)) {
      recommendedPackage = "the PRESENCE package";
    } else if (frustration && /time|admin|manual|slow/i.test(frustration)) {
      recommendedPackage = "the AUTOMATION package";
    }
    lines.push(`Based on your biggest frustration — **${frustration}** — the highest-impact starting point for ${businessName} is ${recommendedPackage}.`);
    lines.push(``);
  }

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

  // ── Single CTA / Next Step ────────────────────────────────────────────────
  lines.push(`---`);
  lines.push(``);
  lines.push(`## Your Next Step`);
  lines.push(``);

  let ctaLine = "When you're ready to close these gaps, we're here.";
  if (p.urgency_timeline && /asap|now/i.test(p.urgency_timeline)) {
    ctaLine = "You're ready to move — let's get started this week.";
  } else if (p.urgency_timeline && /month/i.test(p.urgency_timeline)) {
    ctaLine = "You're in the right window to start now and see results within 30 days.";
  }

  lines.push(`**${ctaLine}**`);
  lines.push(``);

  const waNumber = (p.whatsapp || "").replace(/[^\d+]/g, "") || "27000000000";
  lines.push(`📲 **[Reply to this message on WhatsApp](https://wa.me/${waNumber})** or book a 30-minute strategy call to walk through this blueprint together.`);
  lines.push(``);
  lines.push(`*Your blueprint was prepared specifically for ${businessName} based on your intake answers. Results shown are based on ${p.sub_niche || p.industry || "your"} industry benchmarks.*`);

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
