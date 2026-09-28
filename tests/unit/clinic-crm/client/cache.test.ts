import {
  PersistentCache,
  cachePrefix,
  isPersistableKey,
  redactForStorage,
} from "../../../../lib/clinic-crm/client/cache";
import { MemoryStorage } from "./memoryStorage";

const CLINIC = "11111111-2222-3333-4444-555555555555";

function make(opts: ConstructorParameters<typeof PersistentCache>[1] = {}) {
  const storage = new MemoryStorage();
  let now = 1_000_000;
  const cache = new PersistentCache(storage, { now: () => now, ...opts });
  cache.setScope(CLINIC);
  return { storage, cache, tick: (ms: number) => (now += ms) };
}

describe("PersistentCache", () => {
  it("namespaces keys by version and clinic", () => {
    const { storage, cache } = make();
    expect(cache.write("goals", [1])).toBe(true);
    expect(storage.keys()).toEqual([`vsc:v1:${CLINIC}:q:goals`]);
    expect(cachePrefix(CLINIC)).toBe(`vsc:v1:${CLINIC}:q:`);
  });

  it("does not persist anything before a clinic scope is set", () => {
    const storage = new MemoryStorage();
    const cache = new PersistentCache(storage);
    expect(cache.write("goals", [1])).toBe(false);
    cache.setScope("../evil"); // invalid scope is refused
    expect(cache.write("goals", [1])).toBe(false);
    expect(storage.length).toBe(0);
  });

  it("isolates clinics sharing a browser", () => {
    const { cache } = make();
    cache.write("dashboard", { a: 1 });
    cache.setScope("other-clinic");
    expect(cache.read("dashboard")).toBeNull();
  });

  it("expires entries after the TTL", () => {
    const { cache, tick, storage } = make({ ttlMs: 1000 });
    cache.write("goals", ["g"]);
    tick(999);
    expect(cache.read("goals")?.v).toEqual(["g"]);
    tick(2);
    expect(cache.read("goals")).toBeNull();
    expect(storage.length).toBe(0); // expired entry removed
  });

  it("evicts the oldest entries beyond maxEntries", () => {
    const { cache, tick } = make({ maxEntries: 3 });
    for (const k of ["a", "b", "c", "d"]) {
      cache.write(k, k);
      tick(10);
    }
    expect(cache.read("a")).toBeNull();
    expect(["b", "c", "d"].map((k) => cache.read(k)?.v)).toEqual(["b", "c", "d"]);
  });

  it("evicts oldest to stay under maxTotalBytes and refuses oversized entries", () => {
    const { cache, tick } = make({ maxTotalBytes: 300, maxEntryBytes: 200 });
    cache.write("a", "x".repeat(100));
    tick(1);
    cache.write("b", "y".repeat(100));
    tick(1);
    cache.write("c", "z".repeat(100));
    expect(cache.read("a")).toBeNull();
    expect(cache.read("c")).not.toBeNull();
    expect(cache.write("huge", "q".repeat(500))).toBe(false);
    expect(cache.read("huge")).toBeNull();
  });

  it("recovers from QuotaExceeded by evicting then retrying", () => {
    const { cache, storage, tick } = make();
    for (const k of ["a", "b", "c", "d"]) {
      cache.write(k, "x".repeat(50));
      tick(1);
    }
    storage.quotaBytes = storage.keys().reduce((s, k) => s + (storage.getItem(k) as string).length, 0);
    expect(cache.write("e", "x".repeat(50))).toBe(true);
    expect(cache.read("e")).not.toBeNull();
    expect(cache.read("a")).toBeNull();
  });

  it("never throws when storage is unavailable (Safari private mode)", () => {
    const { cache, storage } = make();
    storage.broken = true;
    expect(() => cache.write("goals", [1])).not.toThrow();
    expect(cache.write("goals", [1])).toBe(false);
    expect(cache.read("goals")).toBeNull();
    expect(() => cache.clearAll()).not.toThrow();
    expect(() => new PersistentCache(null).write("x", 1)).not.toThrow();
  });

  it("clearAll wipes every clinic's cache and nothing else", () => {
    const { cache, storage } = make();
    cache.write("goals", [1]);
    cache.setScope("other");
    cache.write("goals", [2]);
    storage.setItem("unrelated", "keep");
    cache.clearAll();
    expect(storage.keys()).toEqual(["unrelated"]);
  });

  it("maps storage keys back to query keys for cross-tab sync", () => {
    const { cache } = make();
    expect(cache.queryKeyOf(`vsc:v1:${CLINIC}:q:patients:lead`)).toBe("patients:lead");
    expect(cache.queryKeyOf("vsc:v1:other:q:goals")).toBeNull();
  });
});

describe("POPIA: PII never reaches disk", () => {
  it.each(["conversations", "conversation:abc", "messages", "messages:abc", "patient:abc", "patient-export:abc"])(
    "%s is memory-only",
    (key) => {
      const { cache, storage } = make();
      expect(isPersistableKey(key)).toBe(false);
      expect(cache.write(key, [{ body: "hi" }])).toBe(false);
      expect(storage.length).toBe(0);
    },
  );

  it("non-PII keys persist", () => {
    for (const k of ["dashboard", "patients", "patients:lead", "appointments:2026-09-28", "goals", "automations"]) {
      expect(isPersistableKey(k)).toBe(true);
    }
  });

  it("blanks notes and patient message bodies before writing", () => {
    const { cache, storage } = make();
    const patients = [{ id: "p1", firstName: "Thandi", notes: "allergic to penicillin", tags: [] as string[] }];
    const dashboard = {
      today: [{ id: "a1", patientId: "p1", service: "Cleaning" }],
      inbox: [{ patientId: "p1", body: "my tooth hurts", lastMessage: "my tooth hurts" }],
    };
    cache.write("patients", patients);
    cache.write("dashboard", dashboard);
    const disk = storage
      .keys()
      .map((k) => storage.getItem(k))
      .join("\n");
    expect(disk).not.toMatch(/penicillin/);
    expect(disk).not.toMatch(/tooth/);
    expect(cache.read<typeof patients>("patients")?.v[0]).toEqual({ ...patients[0], notes: "" });
    expect(patients[0].notes).toBe("allergic to penicillin"); // input not mutated
  });

  it("keeps non-patient bodies (automation templates)", () => {
    const automations = [{ id: "x", kind: "recall", body: "Time for your check-up", notes: "n" }];
    expect(redactForStorage(automations)).toEqual([{ ...automations[0], notes: "" }]);
  });
});
