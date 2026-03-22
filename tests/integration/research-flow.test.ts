import { aggregateCompetitorData } from "../../mcp/research-orchestrator/server";

function log(expected: unknown, actual: unknown) {
  globalThis.qaLogExpectedActual?.({ expected, actual });
}

jest.mock("postgres", () => {
  const fn = () => {
    const db = Object.assign(
      async () => [],
      {
        unsafe: async () => [],
        end: async () => undefined,
      }
    );
    return db;
  };
  return { __esModule: true, default: fn };
});

describe("Integration: Full research flow", () => {
  beforeEach(() => {
    process.env.WHOIS_BASE_URL = "https://mock-gateway.example";
    process.env.PAGESPEED_API_KEY = "fake";
    process.env.REPORTS_PG_URL = "postgres://fake";
  });

  test("Agent 2 research → API calls → JSON output → database storage", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch" as any).mockImplementation(async (url: any) => {
      const u = String(url);
      if (u.includes("tranco-list.eu/api/ranks/domain/")) {
        return new Response(JSON.stringify({ ranks: [{ date: "2026-03-18", rank: 12345 }] }), { status: 200 });
      }
      if (u.includes("/lookup")) {
        return new Response(JSON.stringify({ registrationDate: "2020-01-01" }), { status: 200 });
      }
      if (u.includes("pagespeedonline")) {
        return new Response(JSON.stringify({ lighthouseResult: { categories: { performance: { score: 0.78 } } } }), { status: 200 });
      }
      if (u.includes("https://acme.example") || u.includes("https://comp.example")) {
        return new Response(
          `<!doctype html><html><head><title>Acme Widgets - B2B Widget Platform</title><meta name="description" content="Widgets for B2B teams"></head><body><h1>Widgets</h1><p>Widget platform for sales teams.</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    const out = await aggregateCompetitorData({
      clientId: "client_123",
      clientName: "Acme Co",
      websiteUrl: "https://acme.example",
      industry: "B2B",
      revenueRange: "100k-500k",
      competitors: ["comp.example"],
      currentMarketing: { ads: true },
      pg_url: "postgres://fake",
      delay_ms: 0,
    } as any);

    log({ hasSections: true }, { keys: Object.keys(out.research ?? {}) });
    expect(out.research).toHaveProperty("website-health");
    expect(out.research).toHaveProperty("competitor-benchmarks");
    expect(out.stored).toHaveProperty("id");
    expect(fetchSpy).toHaveBeenCalled();
  });
});

