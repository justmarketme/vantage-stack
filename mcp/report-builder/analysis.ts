import type { Gap, ResearchJson, RevenueOpportunity, Upsell } from "./schema";
import { generateHealthScore } from "./scoring";

function safeNum(n: unknown, fallback: number) {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function fmtPct(n: number) {
  return `${Math.round(n * 1000) / 10}%`;
}

function topCpc(research: ResearchJson): number | undefined {
  const list = research.ads?.cpcByKeyword?.filter((k) => Number.isFinite(k.cpcUsd));
  if (!list?.length) return undefined;
  const sorted = list.slice().sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
  const weighted = sorted
    .slice(0, Math.min(10, sorted.length))
    .reduce(
      (acc, k) => {
        const w = k.volume ?? 1;
        return { sum: acc.sum + k.cpcUsd * w, w: acc.w + w };
      },
      { sum: 0, w: 0 },
    );
  if (!weighted.w) return undefined;
  return weighted.sum / weighted.w;
}

export function identifyGaps(research: ResearchJson): Gap[] {
  const gaps: Gap[] = [];

  const health = generateHealthScore(research);
  const monthlyVisits = safeNum(research.metrics?.traffic?.monthlyVisits, 0);
  const mobileSpeed = research.metrics?.speed?.mobileScore;
  const rd = safeNum(research.metrics?.backlinks?.referringDomains, 0);

  const strongestCompetitor = (research.competitors ?? [])
    .slice()
    .sort((a, b) => safeNum(b.metrics?.trafficMonthlyVisits, 0) - safeNum(a.metrics?.trafficMonthlyVisits, 0))[0];

  if (health.total < 65) {
    gaps.push({
      category: "traffic",
      title: "Overall website health is holding growth back",
      whyItMatters:
        "When traffic, speed, and authority are all “okay but not great”, you end up paying more for every lead and losing to faster, more trusted competitors.",
      evidence: `Health Score: ${health.total}/100 (Traffic ${health.trafficScore}, Speed ${health.speedScore}, Backlinks ${health.backlinksScore}).`,
      competitorReference: strongestCompetitor?.name
        ? `Top competitor by traffic in dataset: ${strongestCompetitor.name}.`
        : undefined,
      severity: "high",
    });
  }

  if (monthlyVisits < 8000) {
    gaps.push({
      category: "traffic",
      title: "Traffic is below the level needed for consistent lead volume",
      whyItMatters:
        "Low baseline traffic makes revenue lumpy. Scaling becomes ad-dependent and expensive, instead of compounding from SEO + brand demand.",
      evidence: `Estimated monthly visits: ${monthlyVisits || "unknown"}.`,
      severity: monthlyVisits ? "medium" : "high",
    });
  }

  if (typeof mobileSpeed === "number" && mobileSpeed < 75) {
    gaps.push({
      category: "speed",
      title: "Mobile performance is likely leaking conversions",
      whyItMatters:
        "Mobile speed is a direct conversion lever; slow pages reduce form completions, calls, and purchases—especially from paid traffic.",
      evidence: `Mobile performance score: ${mobileSpeed}.`,
      severity: mobileSpeed < 60 ? "high" : "medium",
    });
  }

  if (rd && strongestCompetitor?.metrics?.referringDomains && rd < strongestCompetitor.metrics.referringDomains * 0.6) {
    gaps.push({
      category: "backlinks",
      title: "Authority gap vs competitors (referring domains)",
      whyItMatters:
        "If competitors have materially more quality sites linking to them, they outrank you on high-intent keywords and can spend less on ads to get the same customers.",
      evidence: `Referring domains: you ${rd}, competitor ${strongestCompetitor.metrics.referringDomains}.`,
      competitorReference: strongestCompetitor.name,
      severity: "high",
    });
  } else if (!rd) {
    gaps.push({
      category: "backlinks",
      title: "Backlink authority isn’t tracked (or is very low)",
      whyItMatters:
        "Without an authority baseline, it’s hard to explain ranking volatility or build a predictable SEO plan.",
      severity: "medium",
    });
  }

  const missing = research.seo?.missingKeywords ?? [];
  if (missing.length >= 10) {
    gaps.push({
      category: "keywords",
      title: "High-intent keyword gaps (competitors capturing demand)",
      whyItMatters:
        "Missing keywords are missed revenue. These terms are already being searched; ranking for them reduces reliance on ads and increases inbound leads.",
      evidence: `Missing keywords identified: ${missing.length}. Top examples: ${missing
        .slice(0, 5)
        .map((k) => k.keyword)
        .join(", ")}.`,
      severity: "high",
    });
  } else if (missing.length > 0) {
    gaps.push({
      category: "keywords",
      title: "Some keyword coverage gaps remain",
      whyItMatters:
        "Even a small set of high-intent keywords can materially change lead flow if you build pages that match intent.",
      evidence: `Missing keywords identified: ${missing.length}.`,
      severity: "medium",
    });
  }

  for (const t of research.seo?.technicalFindings ?? []) {
    gaps.push({
      category: "technical",
      title: t.issue,
      whyItMatters: "Technical SEO issues reduce crawl efficiency, rankings, and conversion quality from organic traffic.",
      evidence: t.evidence,
      severity: t.impact ?? "medium",
    });
  }

  for (const c of research.conversion?.findings ?? []) {
    gaps.push({
      category: "conversion",
      title: c.issue,
      whyItMatters:
        "Conversion friction means you can increase leads without increasing traffic—often the fastest path to revenue lift.",
      evidence: c.evidence,
      severity: c.impact ?? "medium",
    });
  }

  return gaps;
}

export function calculateRevenueOpportunity(research: ResearchJson): RevenueOpportunity {
  const notes: string[] = [];

  const monthlyVisits = safeNum(research.metrics?.traffic?.monthlyVisits, 10000);
  if (!research.metrics?.traffic?.monthlyVisits) notes.push("Monthly visits missing; defaulted to 10,000 for estimates.");

  const ctr = safeNum(research.ads?.benchmarks?.ctr, 0.025);
  if (!research.ads?.benchmarks?.ctr) notes.push(`CTR missing; defaulted to ${fmtPct(ctr)}.`);

  const conversionRate = safeNum(research.ads?.benchmarks?.conversionRate, 0.03);
  if (!research.ads?.benchmarks?.conversionRate) notes.push(`Conversion rate missing; defaulted to ${fmtPct(conversionRate)}.`);

  // avgValue can represent AOV or lead value; prefer leadValue if present.
  const avgValue = safeNum(
    research.ads?.benchmarks?.leadValue ?? research.ads?.benchmarks?.avgOrderValue,
    150,
  );
  if (!(research.ads?.benchmarks?.leadValue ?? research.ads?.benchmarks?.avgOrderValue)) {
    notes.push("Lead value / AOV missing; defaulted to $150 per conversion.");
  }

  const cpcUsd = safeNum(topCpc(research), 2.5);
  if (!topCpc(research)) notes.push("Keyword CPC data missing; defaulted blended CPC to $2.50.");

  // “Capture share” is the share of their total traffic we could additionally buy as incremental clicks.
  // Conservative default: buy clicks equal to 20% of their current monthly visits.
  const trafficCaptureShare = 0.2;

  const clicks = Math.round(monthlyVisits * trafficCaptureShare * ctr);
  const spendUsd = Math.round(clicks * cpcUsd);
  const conversions = Math.max(0, Math.round(clicks * conversionRate));
  const revenueUsd = Math.round(conversions * avgValue);
  const roas = spendUsd > 0 ? Math.round((revenueUsd / spendUsd) * 100) / 100 : 0;

  return {
    assumptions: { monthlyVisits, ctr, conversionRate, avgValue, cpcUsd, trafficCaptureShare },
    estimates: { clicks, spendUsd, conversions, revenueUsd, roas },
    notes,
  };
}

export function frameUpsells(research: ResearchJson, gaps: Gap[]): Upsell[] {
  const upsells: Upsell[] = [];

  const hasSpeedGap = gaps.some((g) => g.category === "speed" && (g.severity === "high" || g.severity === "medium"));
  const hasKeywordGap = gaps.some((g) => g.category === "keywords" && g.severity !== "low");
  const hasBacklinkGap = gaps.some((g) => g.category === "backlinks" && g.severity !== "low");
  const hasConversionGap = gaps.some((g) => g.category === "conversion" && g.severity !== "low");

  if (hasSpeedGap) {
    upsells.push({
      offer: "Performance & Core Web Vitals Sprint (2 weeks)",
      outcome: "Faster mobile experience, lower bounce, higher conversion rate (especially for paid traffic).",
      whyNow: "Speed fixes compound: you improve SEO performance and paid conversion at the same time.",
      scope: ["LCP/INP diagnosis", "Image/font optimization", "JS bundle trimming", "Caching strategy", "Before/after benchmarks"],
      proofAngle: "Before/after Lighthouse + real-user metrics snapshot.",
      investmentRange: "Once-off sprint",
    });
  }

  if (hasKeywordGap) {
    upsells.push({
      offer: "SEO Growth Pod (90 days)",
      outcome: "Capture demand competitors are currently converting; build compounding inbound lead flow.",
      whyNow: "Every month you delay, competitors keep absorbing existing search demand.",
      scope: [
        "Keyword map (intent + revenue)",
        "New landing pages for missing terms",
        "Content refresh of existing pages",
        "Internal linking + topical clusters",
        "Technical SEO backlog execution",
      ],
      proofAngle: "Rankings + lead lift tracked weekly.",
      investmentRange: "Monthly retainer",
    });
  }

  if (hasBacklinkGap) {
    upsells.push({
      offer: "Authority & Digital PR (8–12 weeks)",
      outcome: "Increase domain authority so key pages rank higher with less content effort.",
      whyNow: "Authority is a moat; it makes every future content piece more effective.",
      scope: ["Link gap analysis", "Partner placements", "Digital PR angles", "Local citations (if relevant)", "Referring-domain growth reporting"],
      investmentRange: "Monthly retainer",
    });
  }

  if (hasConversionGap) {
    upsells.push({
      offer: "Conversion Rate Optimization (CRO) Build (30 days)",
      outcome: "Increase leads/sales without needing more traffic.",
      whyNow: "CRO is the fastest path to revenue lift when traffic is stable.",
      scope: [
        "Landing page restructure",
        "Offer/CTA hierarchy",
        "Form friction reduction",
        "Trust assets (proof, guarantees, case studies)",
        "Analytics + event tracking",
      ],
      investmentRange: "Once-off build + optional testing retainer",
    });
  }

  // Always include a “report-to-execution” offer.
  upsells.push({
    offer: "Growth Optimization Blueprint Workshop (90 minutes)",
    outcome: "Turn this report into a prioritized 30/60/90-day execution plan tied to revenue targets.",
    whyNow: "The fastest way to reduce guesswork and align stakeholders on what to do next.",
    scope: ["Report walkthrough", "Opportunity sizing", "Prioritized backlog", "Owner + timeline mapping"],
    investmentRange: "Fixed-fee",
  });

  // Light personalization hooks
  const industry = research.site?.industry?.trim();
  if (industry) {
    upsells.forEach((u) => {
      if (!u.proofAngle) u.proofAngle = `Benchmark lift examples from similar ${industry} funnels.`;
    });
  }

  return upsells;
}

