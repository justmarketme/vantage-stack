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
    await api.leads.list({ stage: "new", q: " glow ", scope: "mine" });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/consultant/leads?stage=new&q=glow&scope=mine");
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
