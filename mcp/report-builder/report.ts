import type { Gap, HealthScoreBreakdown, ResearchJson, RevenueOpportunity, Upsell } from "./schema";

function jsonBlock(tag: string, payload: unknown) {
  return ["```json", JSON.stringify({ tag, payload }, null, 2), "```"].join("\n");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreLabel(score: number) {
  if (score >= 85) return "Strong";
  if (score >= 70) return "Good";
  if (score >= 55) return "Needs work";
  return "Critical";
}

function fmtUsd(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1000) return `${sign}$${Math.round(abs).toLocaleString()}`;
  return `${sign}$${Math.round(abs)}`;
}

export function createMarkdownReport(args: {
  research: ResearchJson;
  health: HealthScoreBreakdown;
  gaps: Gap[];
  revenue: RevenueOpportunity;
  upsells: Upsell[];
}): string {
  const { research, health, gaps, revenue, upsells } = args;

  const siteUrl = research.site?.url ?? "Website";
  const industry = research.site?.industry;
  const competitorNames = (research.competitors ?? []).map((c) => c.name).filter(Boolean);
  const missingKeywords = research.seo?.missingKeywords ?? [];

  const traffic = research.metrics?.traffic?.monthlyVisits;
  const sources = research.metrics?.traffic?.sources ?? {};
  const mobileSpeed = research.metrics?.speed?.mobileScore;
  const desktopSpeed = research.metrics?.speed?.desktopScore;
  const rd = research.metrics?.backlinks?.referringDomains;

  const topGaps = gaps
    .slice()
    .sort((a, b) => ({ low: 0, medium: 1, high: 2 }[b.severity] - { low: 0, medium: 1, high: 2 }[a.severity]))
    .slice(0, 8);

  const trafficAnalysisData = {
    monthlyVisits: traffic ?? null,
    sourceShare: sources,
    notes: [
      "Chart-ready: sourceShare can be used directly for a pie chart.",
      "If monthlyVisits is null, the report is using conservative defaults in other sections.",
    ],
  };

  const competitorGapData = {
    competitors: (research.competitors ?? []).map((c) => ({
      name: c.name,
      url: c.url ?? null,
      trafficMonthlyVisits: c.metrics?.trafficMonthlyVisits ?? null,
      referringDomains: c.metrics?.referringDomains ?? null,
      speedScore: c.metrics?.speedScore ?? null,
      authorityScore: c.metrics?.authorityScore ?? null,
      advantages: c.advantages ?? [],
    })),
  };

  const seoOpportunitiesData = {
    missingKeywordCount: missingKeywords.length,
    topMissingKeywords: missingKeywords.slice(0, 20),
  };

  const conversionCritiqueData = {
    findings: research.conversion?.findings ?? [],
  };

  const revenueData = revenue;

  const nextSteps = upsells.map((u) => ({
    offer: u.offer,
    outcome: u.outcome,
    whyNow: u.whyNow,
    scope: u.scope,
    investmentRange: u.investmentRange ?? null,
  }));

  const headline = `${siteUrl}${industry ? ` — Growth Opportunity Report (${industry})` : " — Growth Opportunity Report"}`;

  const healthSpeed = clamp(Math.round(((mobileSpeed ?? desktopSpeed ?? 0) / 100) * 100), 0, 100);
  const reportDate = new Date().toISOString().slice(0, 10);

  return [
    `## ${headline}`,
    ``,
    `Generated: ${reportDate}`,
    ``,
    `### Website Health Score`,
    ``,
    `**Score:** ${health.total}/100 (${scoreLabel(health.total)})`,
    ``,
    `- **Traffic:** ${health.trafficScore}/100`,
    `- **Speed:** ${health.speedScore}/100`,
    `- **Backlinks/Authority:** ${health.backlinksScore}/100`,
    ``,
    ...(health.notes.length ? [`**Notes:**`, ...health.notes.map((n) => `- ${n}`), ``] : [""]),
    jsonBlock("website_health_score", {
      site: research.site ?? {},
      score: health,
      raw: { monthlyVisits: traffic ?? null, mobileSpeed: mobileSpeed ?? null, desktopSpeed: desktopSpeed ?? null, referringDomains: rd ?? null },
    }),
    ``,
    `### Traffic Analysis`,
    ``,
    `- **Estimated monthly visits:** ${traffic ?? "unknown"}`,
    `- **Top channels:** ${
      Object.keys(sources).length
        ? Object.entries(sources)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([k, v]) => `${k} (${Math.round(v * 100)}%)`)
            .join(", ")
        : "not provided"
    }`,
    ``,
    `**Interpretation:** If traffic is flat, conversion + offer clarity is the fastest lever. If traffic is low, keyword capture + authority is the fastest compounding lever.`,
    ``,
    jsonBlock("traffic_analysis", trafficAnalysisData),
    ``,
    `### Competitive Gap Analysis`,
    ``,
    competitorNames.length
      ? `Competitors referenced in this dataset: ${competitorNames.join(", ")}.`
      : `Competitor set not provided in the research JSON.`,
    ``,
    `**Where you’re likely losing today (high-signal gaps):**`,
    ...topGaps.map((g) => `- **${g.title}** (${g.category}, ${g.severity}) — ${g.whyItMatters}${g.evidence ? ` Evidence: ${g.evidence}` : ""}`),
    ``,
    jsonBlock("competitive_gap_analysis", competitorGapData),
    ``,
    `### SEO Opportunities`,
    ``,
    missingKeywords.length
      ? [
          `**High-intent keywords missing:** ${missingKeywords.length}`,
          ``,
          `Top missing terms to target first (by volume when available):`,
          ...missingKeywords
            .slice()
            .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
            .slice(0, 10)
            .map((k) => `- **${k.keyword}**${k.volume ? ` (vol: ${k.volume})` : ""}${k.intent ? ` — intent: ${k.intent}` : ""}`),
          ``,
        ].join("\n")
      : `No missing-keyword list provided. (This section will be stronger once Agent 2 includes competitor keyword overlap + missed intent clusters.)`,
    jsonBlock("seo_opportunities", seoOpportunitiesData),
    ``,
    `### Conversion Critique`,
    ``,
    (research.conversion?.findings?.length
      ? research.conversion.findings.slice(0, 10).map((f) => `- **${f.issue}** (${f.impact ?? "medium"})${f.recommendation ? ` — fix: ${f.recommendation}` : ""}`)
      : [`No structured conversion findings provided. Recommended baseline checks: above-the-fold offer clarity, CTA hierarchy, trust assets, social proof, frictionless forms, and fast mobile UX.`]
    ).join("\n"),
    ``,
    jsonBlock("conversion_critique", conversionCritiqueData),
    ``,
    `### Revenue Opportunity`,
    ``,
    `Using conservative paid growth assumptions (blended CPC + benchmarks), here’s what a “starter” paid capture could look like:`,
    ``,
    `- **Estimated monthly spend:** ${fmtUsd(revenue.estimates.spendUsd)}`,
    `- **Estimated monthly conversions:** ${revenue.estimates.conversions}`,
    `- **Estimated monthly revenue:** ${fmtUsd(revenue.estimates.revenueUsd)}`,
    `- **ROAS:** ${revenue.estimates.roas}x`,
    ``,
    revenue.notes.length ? ["**Assumption notes:**", ...revenue.notes.map((n) => `- ${n}`), ``].join("\n") : "",
    jsonBlock("revenue_opportunity", revenueData),
    ``,
    `### Recommended Next Steps`,
    ``,
    `These are framed as “logical next steps” based on the gaps above—each one is a clean, scoped engagement with a clear business outcome:`,
    ``,
    ...nextSteps.map(
      (s) =>
        `- **${s.offer}** — ${s.outcome}\n  - **Why now:** ${s.whyNow}\n  - **Scope:** ${s.scope.join("; ")}${
          s.investmentRange ? `\n  - **Engagement:** ${s.investmentRange}` : ""
        }`,
    ),
    ``,
    jsonBlock("recommended_next_steps", { nextSteps }),
    ``,
    `---`,
    ``,
    `### Embedded Research JSON (for traceability)`,
    ``,
    `This block is included so downstream tooling (e.g. video generation) can reference the original inputs used to produce the report.`,
    ``,
    "```json",
    JSON.stringify({ tag: "source_research_json", payload: research }, null, 2),
    "```",
    "",
    `### Quick takeaway`,
    ``,
    `If you fix speed + conversion friction first, every channel gets cheaper. If you fill the missing keyword set and close authority gaps next, lead flow compounds and dependence on ads drops.`,
    "",
  ].filter((l) => l !== undefined).join("\n");
}

