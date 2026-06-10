import { splitListish } from "../blueprint/schema";
import type { AggregatedClientContext, DiscoverySnapshot } from "./types";
import { extractBrandContext } from "../crm/brand-context";

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") return splitListish(v);
  return [];
}

function inferStage(revenueRange: string, monthlyBudget: string): AggregatedClientContext["companyStage"] {
  const r = `${revenueRange} ${monthlyBudget}`.toLowerCase();
  if (/\b(enterprise|10m|20m|50m|100m|1b)\b/i.test(r)) return "Enterprise";
  if (/\b(smb|small|medium|1m|2m|5m|500k)\b/i.test(r)) return "SMB";
  if (/\b(startup|pre-revenue|under\s*100k|seed)\b/i.test(r)) return "Startup";
  return "Unknown";
}

export async function aggregateFromClientDetail(
  clientId: string,
  profile: Record<string, unknown>,
  notes: { body?: string }[],
  discovery: DiscoverySnapshot,
  competitorAnalysisExtra: string,
  healthScore: number | null,
): Promise<AggregatedClientContext> {
  const challenges = asStringArray(profile.challenges);
  const competitors = asStringArray(profile.competitors);
  const toolsUsed = asStringArray(profile.tools_used);
  const mbRaw = profile.monthly_budget;
  const monthlyBudget =
    typeof mbRaw === "number" && Number.isFinite(mbRaw) ? String(mbRaw) : String(mbRaw ?? "");
  const mb =
    typeof mbRaw === "number" && Number.isFinite(mbRaw)
      ? mbRaw
      : Number.isFinite(Number(monthlyBudget))
        ? Number(monthlyBudget)
        : null;

  const notesJoined = notes
    .map((n) => (n.body || "").trim())
    .filter(Boolean)
    .join("\n\n");

  // Parse social_insights jsonb
  const rawSocialInsights = profile.social_insights as Record<string, unknown> | null | undefined;
  const socialInsightsRaw = rawSocialInsights ?? null;
  const socialInsights: AggregatedClientContext["socialInsights"] = socialInsightsRaw
    ? {
        instagram: socialInsightsRaw.instagram
          ? {
              followers: (socialInsightsRaw.instagram as Record<string, unknown>).followers as number | null ?? null,
              engagementRate: (socialInsightsRaw.instagram as Record<string, unknown>).engagementRate as number | null ?? null,
              contentThemes: (socialInsightsRaw.instagram as Record<string, unknown>).contentThemes as string[] | null ?? null,
            }
          : null,
        tiktok: socialInsightsRaw.tiktok
          ? { followers: (socialInsightsRaw.tiktok as Record<string, unknown>).followers as number | null ?? null }
          : null,
        facebook: socialInsightsRaw.facebook
          ? { likes: (socialInsightsRaw.facebook as Record<string, unknown>).likes as number | null ?? null }
          : null,
      }
    : null;

  // Parse website enrichment jsonb (look for either column name)
  const rawEnrichment =
    (profile.website_enrichment as Record<string, unknown> | null | undefined) ??
    (profile.enrichment_data as Record<string, unknown> | null | undefined) ??
    null;
  const websiteEnrichment: AggregatedClientContext["websiteEnrichment"] = rawEnrichment
    ? {
        pageSpeedMobile: rawEnrichment.pageSpeedMobile as number | null ?? null,
        pageSpeedDesktop: rawEnrichment.pageSpeedDesktop as number | null ?? null,
        techStack: rawEnrichment.techStack as string[] | null ?? null,
        seoSignals: rawEnrichment.seoSignals as Record<string, unknown> | null ?? null,
        ogTitle: rawEnrichment.ogTitle as string | null ?? null,
        description: rawEnrichment.description as string | null ?? null,
      }
    : null;

  // Brand context (async — uses node-vibrant if available)
  const brandContextRaw = await extractBrandContext(socialInsightsRaw, rawEnrichment, String(profile.name ?? "")).catch(() => null);
  const brandContext: AggregatedClientContext["brandContext"] = brandContextRaw
    ? {
        primaryColor: brandContextRaw.primaryColor,
        darkColor: brandContextRaw.darkColor,
        lightColor: brandContextRaw.lightColor,
        accentColor: brandContextRaw.accentColor,
        brandVoice: brandContextRaw.brandVoice,
        logoUrl: brandContextRaw.logoUrl,
      }
    : null;

  // previous_vendor_exp is text[] column
  const previousVendorExp = Array.isArray(profile.previous_vendor_exp)
    ? (profile.previous_vendor_exp as string[])
    : null;

  // New fields
  const websiteGoal = Array.isArray(profile.website_goal)
    ? (profile.website_goal as string[])
    : typeof profile.website_goal === "string"
      ? asStringArray(profile.website_goal)
      : null;
  const biggestTimeWaste = Array.isArray(profile.biggest_time_waste)
    ? (profile.biggest_time_waste as string[])
    : typeof profile.biggest_time_waste === "string"
      ? asStringArray(profile.biggest_time_waste)
      : null;

  return {
    clientId,
    clientName: String(profile.name ?? ""),
    company: String(profile.company ?? profile.name ?? ""),
    email: String(profile.email ?? ""),
    websiteUrl: String(profile.website_url ?? ""),
    industry: String(profile.industry ?? ""),
    revenueRange: String(profile.revenue_range ?? ""),
    companyStage: inferStage(String(profile.revenue_range ?? ""), monthlyBudget || String(mb ?? "")),
    challenges,
    competitors,
    toolsUsed,
    monthlyBudget: monthlyBudget || "—",
    monthlyBudgetNumeric: mb,
    successGoals: String(profile.success_goals ?? ""),
    currentMarketing: String(profile.current_marketing ?? ""),
    notesJoined,
    healthScore,
    discovery,
    competitorAnalysisExtra,
    subNiche: profile.sub_niche as string | null ?? null,
    socialInsights,
    websiteEnrichment,
    brandContext,
    conversionRate: profile.conversion_rate as string | null ?? null,
    speedToContact: profile.speed_to_contact as string | null ?? null,
    urgencyTimeline: profile.urgency_timeline as string | null ?? null,
    previousVendorExp,
    primarySocialHandle: profile.primary_social_handle as string | null ?? null,
    websiteExists: profile.website_exists as string | null ?? null,
    primaryIntent: profile.primary_intent as string | null ?? null,
    currentWebsiteStatus: (profile as Record<string, unknown>).current_website_status as string | null ?? null,
    googleMapsStatus: (profile as Record<string, unknown>).google_maps_status as string | null ?? null,
    websiteGoal,
    serveArea: profile.serve_area as string | null ?? null,
    biggestTimeWaste,
    teamSize: profile.team_size as string | null ?? null,
    hoursLostPerWeek: profile.hours_lost_per_week as string | null ?? null,
    packagePreference: profile.package_preference as string | null ?? null,
    clientAcquisition: profile.client_acquisition as string | null ?? null,
  };
}
