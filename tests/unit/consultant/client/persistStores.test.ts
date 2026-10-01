import { DRAFTS_PERSIST_NAME, readDraft, writeDraft } from "../../../../lib/consultant/client/drafts";
import { OUTBOX_PERSIST_NAME, Outbox, type OutboxApi } from "../../../../lib/consultant/client/outbox";
import { PERSIST_PREFIX, kvPersistStorage } from "../../../../lib/consultant/client/persist";
import { MemoryStorage, STORAGE_PREFIX, setStorageForTests, type KVStorage } from "../../../../lib/consultant/client/storage";

const LEAD = "11111111-1111-4111-8111-111111111111";
const api = {} as OutboxApi;

describe("Zustand persist stores (wave 2)", () => {
  let mem: MemoryStorage;
  beforeEach(() => {
    mem = new MemoryStorage();
    setStorageForTests(mem);
  });
  afterAll(() => setStorageForTests(undefined));

  it("stores use versioned names under vs:consultant:v2:", () => {
    expect(OUTBOX_PERSIST_NAME).toBe(`${PERSIST_PREFIX}outbox`);
    expect(DRAFTS_PERSIST_NAME).toBe(`${PERSIST_PREFIX}drafts`);
    expect(PERSIST_PREFIX).toBe("vs:consultant:v2:");
  });

  it("outbox: persists ops only (partialize) with a version, never runtime flags", async () => {
    let release!: () => void;
    const slow: OutboxApi = {
      notes: { create: jest.fn(), patch: jest.fn(), revisions: jest.fn() },
      leads: { patch: jest.fn(() => new Promise((r) => (release = () => r({ id: LEAD } as never)))) },
    };
    const box = new Outbox({ api: slow });
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { city: "Durban" } });
    const run = box.flush();
    expect(box.isFlushing).toBe(true);
    const disk = JSON.parse(mem.getItem(OUTBOX_PERSIST_NAME)!);
    expect(disk.version).toBe(1);
    expect(Object.keys(disk.state)).toEqual(["ops"]);
    release();
    await run;
    expect(JSON.parse(mem.getItem(OUTBOX_PERSIST_NAME)!).state.ops).toEqual([]);
  });

  it("outbox: imports a wave-1 queue once, then deletes the old key", () => {
    const legacyOp = {
      kind: "note.create",
      input: { leadId: LEAD, body: "typed offline before the upgrade", clientId: "00000000-0000-4000-8000-000000000001" },
      id: "legacy-1",
      createdAt: 1,
      attempts: 0,
      nextAttemptAt: 1,
      status: "queued",
    };
    mem.setItem(`${STORAGE_PREFIX}outbox`, JSON.stringify([legacyOp, { junk: true }]));
    const box = new Outbox({ api });
    expect(box.list().map((o) => o.id)).toEqual(["legacy-1"]);
    expect(mem.getItem(`${STORAGE_PREFIX}outbox`)).toBeNull();
    expect(new Outbox({ api }).pending).toBe(1); // now lives in the v2 store
  });

  it("outbox: another tab's change is picked up by load()", () => {
    const a = new Outbox({ api });
    const b = new Outbox({ api });
    a.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { city: "CPT" } });
    expect(b.pending).toBe(0);
    b.load();
    expect(b.pending).toBe(1);
  });

  it("outbox: load() never replaces memory with an older disk copy after a failed write", () => {
    const box = new Outbox({ api });
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { city: "A" } });
    // Storage starts refusing writes (quota / private mode).
    const failing: KVStorage = Object.assign(Object.create(mem), {
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      getItem: (k: string) => mem.getItem(k),
      removeItem: (k: string) => mem.removeItem(k),
    });
    setStorageForTests(failing);
    box.enqueue({ kind: "lead.patch", leadId: "22222222-2222-4222-8222-222222222222", patch: { city: "B" } });
    box.load();
    expect(box.pending).toBe(2);
  });

  it("drafts: one blob, deleted when empty; cross-tab clears are respected", () => {
    writeDraft("lead:1", "Wants Botox", 1000);
    writeDraft("lead:2", "Call back Friday", 1000);
    expect(mem.length).toBe(1);
    const blob = JSON.parse(mem.getItem(DRAFTS_PERSIST_NAME)!);
    expect(Object.keys(blob.state.drafts)).toEqual(["lead:1", "lead:2"]);

    // Another tab clears lead:1 directly on disk…
    blob.state.drafts = { "lead:2": blob.state.drafts["lead:2"] };
    mem.setItem(DRAFTS_PERSIST_NAME, JSON.stringify(blob));
    // …so this tab must not resurrect it on its next write.
    writeDraft("lead:3", "x", 2000);
    expect(readDraft("lead:1", 2000)).toBeNull();
    expect(Object.keys(JSON.parse(mem.getItem(DRAFTS_PERSIST_NAME)!).state.drafts).sort()).toEqual(["lead:2", "lead:3"]);

    writeDraft("lead:2", "", 3000);
    writeDraft("lead:3", "", 3000);
    expect(mem.length).toBe(0);
  });

  it("drafts: wave-1 per-key drafts are imported and their keys removed", () => {
    const legacy = new MemoryStorage();
    legacy.setItem(`${STORAGE_PREFIX}draft:lead:9`, JSON.stringify({ v: "old draft", t: 5 }));
    setStorageForTests(legacy);
    expect(readDraft("lead:9", 10)).toEqual({ value: "old draft", savedAt: 5 });
    expect(legacy.getItem(`${STORAGE_PREFIX}draft:lead:9`)).toBeNull();
  });

  it("kvPersistStorage survives corrupt JSON and unavailable storage", () => {
    const s = kvPersistStorage<{ a: number }>();
    mem.setItem("x", "{not json");
    expect(s.getItem("x")).toBeNull();
    setStorageForTests(null);
    const writes: boolean[] = [];
    const s2 = kvPersistStorage<{ a: number }>({ onWrite: (ok) => writes.push(ok) });
    expect(() => s2.setItem("x", { state: { a: 1 }, version: 1 })).not.toThrow();
    expect(writes).toEqual([false]);
  });
});
