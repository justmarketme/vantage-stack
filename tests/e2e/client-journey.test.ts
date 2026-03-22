import { validateBlueprintSubmission } from "../../lib/blueprint/validation";
import { structureResearchOutput } from "../../mcp/research-orchestrator/server";
import { generateHealthScore } from "../../mcp/report-builder/scoring";

function log(expected: unknown, actual: unknown) {
  globalThis.qaLogExpectedActual?.({ expected, actual });
}

describe("E2E: Complete client journey", () => {
  test("form submission → research structuring → score → ready for delivery", () => {
    const blueprint = {
      businessName: "Acme Co",
      industry: "B2B",
      websiteStatus: "yes",
      websiteUrl: "https://acme.example",
      leadSource: "Referrals",
      responseSpeed: "Immediately",
      biggestChallenge: "Low conversions",
      revenueRange: "100k-500k",
      name: "Jane",
      email: "jane@acme.example",
      phone: "+27821234567",
    };

    const validation = validateBlueprintSubmission(blueprint);
    expect(validation.ok).toBe(true);

    const profile: any = {
      clientId: "client_123",
      clientName: blueprint.businessName,
      websiteUrl: blueprint.websiteUrl,
      industry: blueprint.industry,
      revenueRange: blueprint.revenueRange,
      competitors: ["comp.example"],
      currentMarketing: {},
    };

    const client: any = {
      domain: "acme.example",
      traffic: { monthlyVisitors: 12000, bounceRate: 0.42, topSources: [{ source: "search", share: 0.5 }] },
      semrush: { backlinksCount: 123, referringDomains: 45, domainAuthority: 55, topKeywords: [] },
      whois: { registrationDate: "2020-01-01", domainAgeYears: 6.2 },
      pagespeed: { pagespeedScore: 78, mobileScore: 62, coreWebVitals: {} },
      errors: [],
    };

    const competitor: any = {
      domain: "comp.example",
      traffic: { monthlyVisitors: 24000, bounceRate: 0.5, topSources: [{ source: "referral", share: 0.2 }] },
      semrush: { backlinksCount: 999, referringDomains: 240, domainAuthority: 72, topKeywords: [{ keyword: "widgets", volume: 1000 }] },
      whois: { registrationDate: "2012-01-01", domainAgeYears: 14.0 },
      pagespeed: { pagespeedScore: 90, mobileScore: 82, coreWebVitals: {} },
      errors: [],
    };

    const research = structureResearchOutput({ profile, client, competitors: [competitor] }) as any;
    const score = generateHealthScore({
      metrics: {
        traffic: { monthlyVisits: research["website-health"]?.["monthly-visitors"] ?? 0 },
        speed: { mobileScore: research["performance-score"]?.["mobile-score"] ?? 0, desktopScore: research["performance-score"]?.["page-speed"] ?? 0 },
        backlinks: { referringDomains: research["backlink-profile"]?.["referring-domains"] ?? 0, authorityScore: research["backlink-profile"]?.["domain-authority-score"] ?? 0 },
      },
    } as any);

    log({ scoreRange: [0, 100] }, { total: score.total });
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });
});

