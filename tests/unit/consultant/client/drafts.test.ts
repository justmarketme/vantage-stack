import { DRAFT_TTL_MS, clearDraft, pruneDrafts, readDraft, writeDraft } from "../../../../lib/consultant/client/drafts";
import { MemoryStorage, setStorageForTests } from "../../../../lib/consultant/client/storage";

describe("note drafts", () => {
  let mem: MemoryStorage;
  beforeEach(() => {
    mem = new MemoryStorage();
    setStorageForTests(mem);
  });
  afterAll(() => setStorageForTests(undefined));

  it("round-trips, removes empties, expires after TTL", () => {
    expect(writeDraft("lead:1", "Wants Botox", 1000)).toBe(1000);
    expect(readDraft("lead:1", 2000)).toEqual({ value: "Wants Botox", savedAt: 1000 });
    writeDraft("lead:1", "   ", 3000);
    expect(readDraft("lead:1", 3000)).toBeNull();
    writeDraft("lead:2", "old", 0);
    expect(readDraft("lead:2", DRAFT_TTL_MS + 1)).toBeNull();
    expect(mem.length).toBe(0);
  });

  it("clear + prune", () => {
    writeDraft("a", "x", 0);
    writeDraft("b", "y", DRAFT_TTL_MS);
    clearDraft("zzz");
    expect(pruneDrafts(DRAFT_TTL_MS + 10)).toBe(1);
    expect(readDraft("b", DRAFT_TTL_MS + 10)?.value).toBe("y");
  });

  it("never throws when storage is unavailable", () => {
    setStorageForTests(null);
    expect(writeDraft("a", "x")).toBeNull();
    expect(readDraft("a")).toBeNull();
  });
});
