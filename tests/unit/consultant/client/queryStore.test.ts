import { QueryStore, canPersistKey, redactForStorage } from "../../../../lib/consultant/client/queryStore";
import { MemoryStorage, STORAGE_PREFIX, setStorageForTests } from "../../../../lib/consultant/client/storage";

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("QueryStore", () => {
  let mem: MemoryStorage;
  beforeEach(() => {
    mem = new MemoryStorage();
    setStorageForTests(mem);
  });
  afterAll(() => setStorageForTests(undefined));

  it("de-duplicates in-flight requests per key", async () => {
    const s = new QueryStore();
    const fn = jest.fn(async () => [1]);
    s.setFetcher("leads", fn, false);
    await Promise.all([s.revalidate("leads"), s.revalidate("leads"), s.revalidate("leads")]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(s.get("leads").data).toEqual([1]);
  });

  it("an optimistic mutate is not clobbered by a fetch that started earlier", async () => {
    const s = new QueryStore();
    const d = deferred<string>();
    s.setFetcher("lead:1", () => d.promise, false);
    const p = s.revalidate("lead:1");
    s.mutate("lead:1", "optimistic");
    d.resolve("older server value");
    await p;
    expect(s.get("lead:1").data).toBe("optimistic");
  });

  it("notifies subscribers and records errors without throwing", async () => {
    const s = new QueryStore();
    const cb = jest.fn();
    s.subscribe("x", cb);
    s.setFetcher("x", async () => {
      throw new Error("boom");
    }, false);
    await s.revalidate("x");
    expect(s.get("x").error?.message).toBe("boom");
    expect(cb).toHaveBeenCalled();
  });

  it("persists only when asked, redacts sensitive fields, and restores as stale", async () => {
    const s = new QueryStore();
    const detail = {
      lead: { id: "l1", clinicName: "Glow" },
      calls: [{ id: "c1", summary: { summary: "secret" }, transcript: [{ text: "hi" }] }],
      notes: [{ id: "n1", body: "private" }],
    };
    s.setFetcher("lead:l1", async () => detail, true);
    await s.revalidate("lead:l1");
    const raw = mem.getItem(`${STORAGE_PREFIX}q:lead:l1`)!;
    expect(raw).not.toMatch(/secret|private|"hi"/);
    const stored = JSON.parse(raw).v;
    expect(stored.notes).toEqual([]);
    expect(stored.calls[0].summary).toBeNull();
    expect(stored.lead.clinicName).toBe("Glow");

    const fresh = new QueryStore();
    const rec = fresh.get("lead:l1");
    expect(rec.stale).toBe(true);
    expect((rec.data as typeof detail).lead.clinicName).toBe("Glow");

    s.setFetcher("leads:mine", async () => [1], false);
    await s.revalidate("leads:mine");
    expect(mem.getItem(`${STORAGE_PREFIX}q:leads:mine`)).toBeNull();
  });

  it("never persists call / live / note keys even with persist:true", async () => {
    expect(canPersistKey("call:abc")).toBe(false);
    expect(canPersistKey("live:abc")).toBe(false);
    expect(canPersistKey("note:abc")).toBe(false);
    expect(canPersistKey("leads:mine")).toBe(true);
    const s = new QueryStore();
    s.setFetcher("call:1", async () => ({ transcript: ["x"] }), true);
    await s.revalidate("call:1");
    expect(mem.length).toBe(0);
  });

  it("redactForStorage keeps shapes", () => {
    expect(redactForStorage({ a: 1, body: "x", segments: [1], summary: { s: 1 }, nested: [{ notes: [1] }] })).toEqual({
      a: 1,
      body: "",
      segments: [],
      summary: null,
      nested: [{ notes: [] }],
    });
  });

  it("clear() wipes memory + disk and drops late responses", async () => {
    const s = new QueryStore();
    const d = deferred<number[]>();
    s.setFetcher("leads:all", () => d.promise, true);
    const p = s.revalidate("leads:all");
    s.clear();
    d.resolve([1, 2]);
    await p;
    expect(s.get("leads:all").hasData).toBe(false);
    expect(mem.length).toBe(0);
  });
});
