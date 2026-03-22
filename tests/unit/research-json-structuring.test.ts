import { structureResearchOutput } from "../../mcp/research-orchestrator/server";

function log(expected: unknown, actual: unknown) {
  globalThis.qaLogExpectedActual?.({ expected, actual });
}

describe("Research JSON structuring", () => {
  test("output matches required sections", () => {
    const profile: any = {
      clientId: "client_123",
      clientName: "Acme Co",
      websiteUrl: "https://acme.example",
      industry: "B2B",
      revenueRange: "100k-500k",
      competitors: ["comp.example"],
      currentMarketing: { ads: true },
    };

    const client: any = {
      domain: "acme.example",
      traffic: { monthlyVisitors: 12000, bounceRate: 0.42, topSources: [{ source: "search", share: 0.5 }] },
      semrush: { backlinksCount: 123, referringDomains: 45, domainAuthority: 55, topKeywords: [] },
      whois: { registrationDate: "2020-01-01", domainAgeYears: 6.2 },
      pagespeed: { pagespeedScore: 78, mobileScore: 62, coreWebVitals: { CLS: "GOOD" } },
      errors: [],
    };

    const competitors: any[] = [
      {
        domain: "comp.example",
        traffic: { monthlyVisitors: 24000, bounceRate: 0.5, topSources: [{ source: "referral", share: 0.2 }] },
        semrush: { backlinksCount: 999, referringDomains: 240, domainAuthority: 72, topKeywords: [{ keyword: "widgets", volume: 1000 }] },
        whois: { registrationDate: "2012-01-01", domainAgeYears: 14.0 },
        pagespeed: { pagespeedScore: 90, mobileScore: 82, coreWebVitals: {} },
        errors: [],
      },
    ];

    const out: any = structureResearchOutput({ profile, client, competitors });
    const required = [
      "generated_at",
      "client",
      "website-health",
      "traffic-analysis",
      "backlink-profile",
      "competitor-benchmarks",
      "seo-gaps",
      "performance-score",
      "errors",
    ];

    log({ has: required }, { keys: Object.keys(out) });
    for (const k of required) expect(out).toHaveProperty(k);
    expect(out.client).toHaveProperty("domain");
    expect(out["competitor-benchmarks"]).toHaveProperty("competitors");
  });
});

