import { ApiClientError, UNAUTHORIZED_EVENT, api, isSensitiveSearch } from "../../../../lib/clinic-crm/client/api";

const ID = "3f2b8c1e-8a4d-4c3b-9f1e-2a6d7b8c9d0e";

type FetchMock = jest.Mock<Promise<unknown>, [string, RequestInit?]>;

function setFetch(fn: unknown) {
  (globalThis as unknown as { fetch: unknown }).fetch = fn;
}

function mockFetch(status: number, body?: unknown): FetchMock {
  const fn: FetchMock = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  }));
  setFetch(fn);
  return fn;
}

const g = globalThis as unknown as { window?: EventTarget };
let events: string[] = [];
beforeEach(() => {
  events = [];
  g.window = new EventTarget();
  g.window.addEventListener(UNAUTHORIZED_EVENT, () => events.push(UNAUTHORIZED_EVENT));
});
afterEach(() => {
  delete g.window;
});

describe("api client", () => {
  it("validates bodies client-side and throws 400 with fields without calling fetch", async () => {
    const fetch = mockFetch(200, {});
    const err = await api.patients
      .create({ firstName: "", phone: "123", consent: false as unknown as true })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    const e = err as ApiClientError;
    expect(e.status).toBe(400);
    expect(Object.keys(e.fields ?? {})).toEqual(expect.arrayContaining(["firstName", "phone", "consent"]));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends the parsed (normalised) body as same-origin JSON", async () => {
    const fetch = mockFetch(200, { id: ID });
    await api.patients.create({ firstName: " Thandi ", phone: "082 555 1234", consent: true });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/clinic-crm/patients");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.method).toBe("POST");
    const sent = JSON.parse(init?.body as string);
    expect(sent.firstName).toBe("Thandi");
    expect(sent.phone).toBe("+27825551234");
  });

  it("keeps phone/email searches out of the query string and filters locally", async () => {
    const rows = [
      { id: "1", firstName: "A", lastName: "", phone: "+27825551234", email: "a@x.co" },
      { id: "2", firstName: "B", lastName: "", phone: "+27830000000", email: "b@x.co" },
    ];
    const fetch = mockFetch(200, rows);
    const byPhone = await api.patients.list("082 555 1234");
    expect(fetch.mock.calls[0][0]).toBe("/api/clinic-crm/patients");
    expect(byPhone.map((p) => p.id)).toEqual(["1"]);
    const byEmail = await api.patients.list("b@x.co", { lead: true });
    expect(fetch.mock.calls[1][0]).toBe("/api/clinic-crm/patients?lead=1");
    expect(byEmail.map((p) => p.id)).toEqual(["2"]);
    await api.patients.list("Thandi");
    expect(fetch.mock.calls[2][0]).toBe("/api/clinic-crm/patients?q=Thandi");
    expect(isSensitiveSearch("Dr 12")).toBe(false);
  });

  it("rejects non-uuid ids before building a URL", async () => {
    const fetch = mockFetch(200, {});
    await expect(api.patients.get("../../auth/me")).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps ApiError bodies and dispatches unauthorized on 401", async () => {
    mockFetch(401, { error: "Signed out" });
    await expect(api.dashboard.get()).rejects.toMatchObject({ status: 401, error: "Signed out" });
    expect(events).toEqual([UNAUTHORIZED_EVENT]);
  });

  it("does not dispatch unauthorized for a failed login", async () => {
    mockFetch(401, { error: "Invalid email or password" });
    await expect(api.auth.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ status: 401 });
    expect(events).toEqual([]);
  });

  it("surfaces server field errors", async () => {
    mockFetch(409, { error: "Patient has opted out", fields: { patientId: "opted out" } });
    const err = await api.messages.send({ patientId: ID, body: "hi" }).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 409, error: "Patient has opted out", fields: { patientId: "opted out" } });
  });

  it("never leaks non-JSON server text", async () => {
    setFetch(
      jest.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => "duplicate key value violates unique constraint patients_phone",
      })),
    );
    const err = (await api.goals.list().catch((e: unknown) => e)) as ApiClientError;
    expect(err.status).toBe(500);
    expect(err.error).not.toMatch(/constraint/);
  });

  it("maps network failure to status 0", async () => {
    setFetch(
      jest.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(api.goals.list()).rejects.toMatchObject({ status: 0 });
  });

  it("times out after 15s", async () => {
    jest.useFakeTimers();
    try {
      setFetch(jest.fn(() => new Promise(() => undefined)));
      const p = api.goals.list().catch((e: unknown) => e);
      jest.advanceTimersByTime(15_000);
      await expect(p).resolves.toMatchObject({ status: 408 });
    } finally {
      jest.useRealTimers();
    }
  });

  it("state.get returns null on 404; state.put validates key and size and supports keepalive", async () => {
    mockFetch(404, { error: "Not found" });
    await expect(api.state.get("draft:inbox")).resolves.toBeNull();
    await expect(api.state.put("Bad Key!", 1)).rejects.toMatchObject({ status: 400 });
    await expect(api.state.put("big", "x".repeat(20_000))).rejects.toMatchObject({ status: 400 });
    const fetch = mockFetch(200, {});
    await api.state.put("pref:theme", { v: "dark", t: 1 }, { keepalive: true });
    expect(fetch.mock.calls[0][0]).toBe("/api/clinic-crm/state/pref%3Atheme");
    expect(fetch.mock.calls[0][1]?.keepalive).toBe(true);
    expect(fetch.mock.calls[0][1]?.method).toBe("PUT");
  });

  it("DELETE 204 resolves undefined", async () => {
    mockFetch(204);
    await expect(api.patients.remove(ID)).resolves.toBeUndefined();
  });
});
