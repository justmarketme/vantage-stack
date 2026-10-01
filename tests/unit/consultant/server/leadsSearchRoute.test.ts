/**
 * POPIA: lead search must never put the search text (a phone number / name) in a URL.
 * GET /api/consultant/leads rejects `q`; POST /api/consultant/leads/search takes it in the body.
 */
const listLeads = jest.fn();

jest.mock("@/lib/consultant/server/repo/leads", () => ({
  __esModule: true,
  listLeads: (...args: unknown[]) => listLeads(...args),
  createLead: jest.fn(),
  parseLeadListQuery: jest.requireActual("@/lib/consultant/server/repo/leads").parseLeadListQuery,
}));

const SESSION = { memberId: "11111111-2222-4333-8444-555555555555", username: "a", displayName: "A", role: "sales_consultant", isManager: false, canCall: true, permissions: [] };

jest.mock("@/lib/consultant/server/route", () => {
  const { HttpError, json } = jest.requireActual("@/lib/consultant/server/http");
  return {
    __esModule: true,
    consultantRoute: async (_tag: string, _opts: unknown, fn: (s: unknown, db: unknown) => Promise<Response>) => {
      try {
        return await fn(SESSION, {});
      } catch (e) {
        if (e instanceof HttpError) {
          const h = e as { body: unknown; status: number };
          return json(h.body, h.status);
        }
        throw e;
      }
    },
  };
});

import * as leadsRoute from "@/app/api/consultant/leads/route";
import * as searchRoute from "@/app/api/consultant/leads/search/route";

describe("lead search without PII in URLs", () => {
  beforeEach(() => {
    listLeads.mockReset();
    listLeads.mockResolvedValue([]);
  });

  test("GET with ?q= is a 400 and never queries", async () => {
    const res = await leadsRoute.GET(new Request("http://x/api/consultant/leads?q=0825550101"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; fields: Record<string, string> };
    expect(body.fields.q).toMatch(/POST/);
    expect(JSON.stringify(body)).not.toContain("0825550101");
    expect(listLeads).not.toHaveBeenCalled();
  });

  test("GET with an empty ?q= is still rejected", async () => {
    const res = await leadsRoute.GET(new Request("http://x/api/consultant/leads?q="));
    expect(res.status).toBe(400);
  });

  test("GET with stage/scope only still lists", async () => {
    const res = await leadsRoute.GET(new Request("http://x/api/consultant/leads?stage=paid&scope=mine"));
    expect(res.status).toBe(200);
    expect(listLeads).toHaveBeenCalledWith({}, SESSION, { stage: "paid", scope: "mine", q: undefined });
  });

  test("POST search passes the body through to the wave-1 list logic", async () => {
    const res = await searchRoute.POST(
      new Request("http://x/api/consultant/leads/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: "082 555 0101", stage: "no_show", scope: "all" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(listLeads).toHaveBeenCalledWith({}, SESSION, { q: "082 555 0101", stage: "no_show", scope: "all" });
  });

  test("POST search defaults scope to mine and validates stage", async () => {
    await searchRoute.POST(new Request("http://x/s", { method: "POST", body: JSON.stringify({}) }));
    expect(listLeads).toHaveBeenLastCalledWith({}, SESSION, { q: undefined, stage: undefined, scope: "mine" });
    const bad = await searchRoute.POST(new Request("http://x/s", { method: "POST", body: JSON.stringify({ stage: "nope" }) }));
    expect(bad.status).toBe(400);
  });
});
