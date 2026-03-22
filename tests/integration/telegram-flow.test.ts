import { handleUserInputInternal } from "../../mcp/telegram-orchestrator/server";

function log(expected: unknown, actual: unknown) {
  globalThis.qaLogExpectedActual?.({ expected, actual });
}

jest.mock("postgres", () => {
  const fn = () => {
    const db = Object.assign(
      async () => [],
      {
        unsafe: async (sqlText) => {
          const q = String(sqlText);
          if (q.includes("from clients")) {
            return [{ id: "client_123", name: "Acme Co", industry: "B2B", status: "active", mrr_usd: 5000, notes: null }];
          }
          if (q.includes("from reports")) {
            return [{ id: "rep_1", client_id: "client_123", client_name: "Acme Co", report_type: "onboarding", created_at: "2026-03-18", health_score: 72, report_markdown: "Report content" }];
          }
          return [];
        },
        end: async () => undefined,
      }
    );
    return db;
  };
  return { __esModule: true, default: fn };
});

describe("Integration: Full Telegram flow", () => {
  beforeEach(() => {
    process.env.BRIEFING_PG_URL = "postgres://fake";
  });

  test("command received → database query → response sent (format produced)", async () => {
    const out = await handleUserInputInternal({ text: "/client Acme Co", send: false } as any);
    log({ includes: "Acme Co" }, { textSnippet: String(out.message?.text ?? "").slice(0, 80) });
    expect(out.message?.text).toContain("Acme Co");
    expect(out.message?.text).toContain("Latest report");
  });
});

