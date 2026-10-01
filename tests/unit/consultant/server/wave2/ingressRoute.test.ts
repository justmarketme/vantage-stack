/**
 * n8n ingress route: signature + parsing happen BEFORE any database work (401 / 400 without a DB).
 * Idempotency against real Postgres is covered in tests/integration/consultant/wave2-3a.test.ts.
 */
import { signBody } from "../../../../../lib/consultant/auth/signing";

const SECRET = "n8n-test-secret";
process.env.N8N_SIGNING_SECRET = SECRET;

jest.mock("../../../../../lib/consultant/server/http", () => {
  const actual = jest.requireActual("../../../../../lib/consultant/server/http");
  return { ...actual, withConsultantDb: jest.fn() };
});

import * as route from "../../../../../app/api/webhooks/n8n-ingress/route";
import { withConsultantDb } from "../../../../../lib/consultant/server/http";

function req(body: string, sig: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (sig) headers["x-vs-signature"] = sig;
  return new Request("http://localhost/api/webhooks/n8n-ingress", { method: "POST", headers, body });
}

describe("POST /api/webhooks/n8n-ingress (front door)", () => {
  beforeEach(() => {
    (withConsultantDb as jest.Mock).mockImplementation(async () => new Response(JSON.stringify({ ok: true, result: { pong: true } }), { status: 200 }));
  });
  const ping = JSON.stringify({ action: "ping", idempotencyKey: "key-12345678" });

  it("401 without / with a wrong / stale signature; nothing runs", async () => {
    expect((await route.POST(req(ping, null))).status).toBe(401);
    expect((await route.POST(req(ping, signBody("other", ping)))).status).toBe(401);
    expect((await route.POST(req(ping, signBody(SECRET, ping, Math.floor(Date.now() / 1000) - 3600)))).status).toBe(401);
    // signature over a DIFFERENT serialisation of the same JSON fails (raw bytes are what count)
    expect((await route.POST(req(ping, signBody(SECRET, JSON.stringify(JSON.parse(ping), null, 2))))).status).toBe(401);
    expect(withConsultantDb).not.toHaveBeenCalled();
  });

  it("400 on a signed but invalid body", async () => {
    const bad = JSON.stringify({ action: "emma.send", idempotencyKey: "short" });
    expect((await route.POST(req(bad, signBody(SECRET, bad)))).status).toBe(400);
    expect((await route.POST(req("{not json", signBody(SECRET, "{not json")))).status).toBe(400);
    expect(withConsultantDb).not.toHaveBeenCalled();
  });

  it("a valid signed request reaches the handler", async () => {
    const res = await route.POST(req(ping, signBody(SECRET, ping)));
    expect(res.status).toBe(200);
    expect(withConsultantDb).toHaveBeenCalledTimes(1);
  });
});
