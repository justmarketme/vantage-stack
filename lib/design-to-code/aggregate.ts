import { splitListish } from "../blueprint/schema";
import type { AggregatedClientContext, DiscoverySnapshot } from "./types";

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

export function aggregateFromClientDetail(
  clientId: string,
  profile: Record<string, unknown>,
  notes: { body?: string }[],
  discovery: DiscoverySnapshot,
  competitorAnalysisExtra: string,
  healthScore: number | null,
): AggregatedClientContext {
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
  };
}
