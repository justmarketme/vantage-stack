import { api, ApiClientError, UNAUTHORIZED_EVENT } from "../../../../lib/consultant/client/api";

type FetchArgs = [string, RequestInit];

function mockFetch(status: number, body?: unknown) {
  const fn = jest.fn<Promise<Response>, FetchArgs>(async () => {
    const text = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
    return { status, ok: status >= 200 && status < 300, text: async () => text } as unknown as Response;
  });
  (globalThis as { fetch: unknown }).fetch = fn;
  return fn;
}

describe("consultant api client", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete (globalThis as { window?: unknown }).window;
  });

  it("sends same-origin JSON and builds paths/query strings", async () => {
    const f = mockFetch(200, []);
    await api.leads.list({ stage: "new", scope: "mine" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/consultant/leads?stage=new&scope=mine");
    expect(init.credentials).toBe("same-origin");
    expect(init.method).toBe("GET");

    mockFetch(200, { id: "c1" });
    await api.calls.start("lead-1");
    const [u2, i2] = (globalThis.fetch as jest.Mock).mock.calls[0] as FetchArgs;
    expect(u2).toBe("/api/consultant/calls");
    expect(i2.method).toBe("POST");
    expect(JSON.parse(String(i2.body))).toEqual({ leadId: "lead-1" });
    expect((i2.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("live polls with after=seq and encodes ids", async () => {
    const f = mockFetch(200, { status: "in_progress", segments: [], lastSeq: 4, ended: false });
    await api.calls.live("a/b", 4.7);
    expect(f.mock.calls[0][0]).toBe("/api/consultant/calls/a%2Fb/live?after=4");
  });

  it("recordingUrl is a same-origin proxy path", () => {
    expect(api.calls.recordingUrl("x1")).toBe("/api/consultant/calls/x1/recording");
  });

  it("204 resolves undefined", async () => {
    mockFetch(204);
    await expect(api.calls.cards("c", { events: [{ cardId: "a", action: "shown", at: new Date().toISOString() }] })).resolves.toBeUndefined();
  });

  it("errors carry status, server message and fields", async () => {
    mockFetch(409, { error: "A Clinics lead with that phone already exists", fields: { phone: "Duplicate" } });
    const err = await api.leads.create({ clinicName: "Glow", phone: "+27825551234" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 409, error: "A Clinics lead with that phone already exists", fields: { phone: "Duplicate" } });
  });

  it("non-JSON error bodies fall back to a generic message (never raw text)", async () => {
    mockFetch(500, "<html>stack trace with secrets</html>");
    const err = await api.me().catch((e) => e);
    expect(err.status).toBe(500);
    expect(err.error).not.toMatch(/stack|secret/);
    expect(err.isTransient).toBe(true);
  });

  it("network failure → status 0", async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await api.me().catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.status).toBe(0);
    expect(err.isNetwork).toBe(true);
  });

  it("401 dispatches consultant:unauthorized", async () => {
    const target = new EventTarget();
    (globalThis as { window?: unknown }).window = target;
    const seen = jest.fn();
    target.addEventListener(UNAUTHORIZED_EVENT, seen);
    mockFetch(401, { error: "Unauthorized" });
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe("consultant api client — wave 2", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });
  const call = (f: jest.Mock, i = 0) => {
    const [url, init] = f.mock.calls[i] as FetchArgs;
    return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined };
  };

  it("search text never goes in a URL: leads.search POSTs, and a legacy list({ q }) is rerouted", async () => {
    const f = mockFetch(200, []);
    await api.leads.search({ q: " 082 555 1234 ", scope: "all" });
    expect(call(f)).toEqual({ url: "/api/consultant/leads/search", method: "POST", body: { q: "082 555 1234", scope: "all" } });
    await api.leads.list({ q: " glow ", stage: "new" });
    expect(call(f, 1)).toEqual({ url: "/api/consultant/leads/search", method: "POST", body: { q: "glow", stage: "new" } });
    await api.leads.list({ q: "   ", scope: "pool" });
    expect(call(f, 2)).toMatchObject({ url: "/api/consultant/leads?scope=pool", method: "GET" });
    for (const [u] of f.mock.calls) expect(u).not.toMatch(/[?&]q=/);
  });

  it.each<[string, () => Promise<unknown>, string, string, unknown]>([
    ["meetings.list range", () => api.meetings.list({ from: "2026-10-05T00:00:00+02:00", to: "2026-10-06T00:00:00+02:00" }), "GET", "/api/consultant/meetings?from=2026-10-05T00%3A00%3A00%2B02%3A00&to=2026-10-06T00%3A00%3A00%2B02%3A00", null],
    ["meetings.list lead", () => api.meetings.list({ leadId: "L1" }), "GET", "/api/consultant/meetings?leadId=L1", null],
    ["meetings.create", () => api.meetings.create({ leadId: "L1", kind: "demo", startsAt: "2026-10-05T09:30:00+02:00" }), "POST", "/api/consultant/meetings", { leadId: "L1", kind: "demo", startsAt: "2026-10-05T09:30:00+02:00" }],
    ["meetings.patch", () => api.meetings.patch("m/1", { status: "held" }), "PATCH", "/api/consultant/meetings/m%2F1", { status: "held" }],
    ["calendar.list", () => api.calendar.list(), "GET", "/api/consultant/calendar", null],
    ["calendar.disconnect", () => api.calendar.disconnect("google"), "DELETE", "/api/consultant/calendar/google", null],
    ["uploads.ticket", () => api.uploads.ticket({ purpose: "goal_image", contentType: "image/webp", bytes: 1000 }), "POST", "/api/consultant/uploads", { purpose: "goal_image", contentType: "image/webp", bytes: 1000 }],
    ["goals.list", () => api.goals.list({ consultantId: "c1" }), "GET", "/api/consultant/goals?consultantId=c1", null],
    ["goals.create", () => api.goals.create({ title: "Car", targetDate: "2026-12-31", metric: "commission", targetValue: 50000 }), "POST", "/api/consultant/goals", { title: "Car", targetDate: "2026-12-31", metric: "commission", targetValue: 50000 }],
    ["goals.patch", () => api.goals.patch("g1", { title: "House" }), "PATCH", "/api/consultant/goals/g1", { title: "House" }],
    ["goals.remove", () => api.goals.remove("g1"), "DELETE", "/api/consultant/goals/g1", null],
    ["metrics.get", () => api.metrics.get("month"), "GET", "/api/consultant/metrics?period=month", null],
    ["metrics.get other", () => api.metrics.get("week", "c2"), "GET", "/api/consultant/metrics?period=week&consultantId=c2", null],
    ["metrics.team", () => api.metrics.team("quarter"), "GET", "/api/consultant/metrics?period=quarter&consultantId=team", null],
    ["leaderboard.get", () => api.leaderboard.get("month", "revenue"), "GET", "/api/consultant/leaderboard?period=month&rankBy=revenue", null],
    ["settings.get", () => api.settings.gamification.get(), "GET", "/api/consultant/settings/gamification", null],
    ["rewards.list", () => api.rewards.list("all"), "GET", "/api/consultant/rewards?status=all", null],
    ["rewards.fulfil", () => api.rewards.fulfil("r1"), "POST", "/api/consultant/rewards/r1/fulfil", null],
    ["deals.confirmPayment", () => api.deals.confirmPayment("L1", { amount: 12500, reference: "EFT 123", paidAt: "2026-10-01T10:00:00+02:00" }), "POST", "/api/consultant/deals/L1/payment", { amount: 12500, reference: "EFT 123", paidAt: "2026-10-01T10:00:00+02:00" }],
    ["training.list", () => api.training.list(), "GET", "/api/consultant/training", null],
    ["training.complete", () => api.training.complete("m1"), "POST", "/api/consultant/training/m1/complete", null],
    ["messages.list", () => api.messages.list("L1"), "GET", "/api/consultant/messages?leadId=L1", null],
    ["admin.health", () => api.admin.health(), "GET", "/api/consultant/admin/health", null],
    ["admin.deadLetters", () => api.admin.deadLetters(), "GET", "/api/consultant/admin/dead-letters", null],
    ["admin.retry", () => api.admin.retryDeadLetter("event", "e1"), "POST", "/api/consultant/admin/dead-letters/event/e1/retry", null],
    ["leads.importScraped", () => api.leads.importScraped({ leads: [] }), "POST", "/api/consultant/leads/import", { leads: [] }],
  ])("%s", async (_name, run, method, url, body) => {
    const f = mockFetch(200, {});
    await run();
    const c = call(f);
    expect(c.method).toBe(method);
    expect(c.url).toBe(url);
    if (body !== null) expect(c.body).toEqual(body);
    else expect(c.body).toBeUndefined();
  });

  it("admin.deadLetters flattens the server's { events, messages } into one retryable list", async () => {
    mockFetch(200, {
      events: [{ kind: "event", id: "e1", type: "deal.paid", occurredAt: "2026-10-01T08:00:00.000Z", targets: ["emma_owner", "n8n"], attempts: 8, lastError: "http_500" }],
      messages: [
        { id: "m1", audience: "lead", leadId: "L1", consultantId: null, channel: "whatsapp", template: "lead_proposal_nudge", status: "dead", attempts: 5, lastError: "twilio_21211", createdAt: "2026-10-01T07:00:00.000Z", sentAt: null },
      ],
    });
    const list = await api.admin.deadLetters();
    expect(list).toEqual([
      { kind: "event", id: "e1", type: "deal.paid", target: "emma_owner, n8n", attempts: 8, lastError: "http_500", createdAt: "2026-10-01T08:00:00.000Z" },
      { kind: "message", id: "m1", type: "lead_proposal_nudge", target: "whatsapp", attempts: 5, lastError: "twilio_21211", createdAt: "2026-10-01T07:00:00.000Z" },
    ]);
    mockFetch(200, { events: [], messages: [] });
    await expect(api.admin.deadLetters()).resolves.toEqual([]);
  });

  it("settings PUT and navigation-only URLs", async () => {
    const f = mockFetch(200, {});
    const settings = { quarterTarget: 1 } as never;
    await api.settings.gamification.put(settings);
    expect(call(f)).toMatchObject({ url: "/api/consultant/settings/gamification", method: "PUT" });
    expect(api.calendar.connectUrl("microsoft")).toBe("/api/consultant/calendar/microsoft/connect");
    expect(api.deals.proofUrl("L 1")).toBe("/api/consultant/deals/L%201/proof");
  });
});
