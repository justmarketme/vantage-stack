import { ApiClientError } from "../../../../lib/consultant/client/api";
import { CONFLICT_MESSAGE, Outbox, outboxBackoff, type OutboxApi } from "../../../../lib/consultant/client/outbox";
import { MemoryStorage, setStorageForTests } from "../../../../lib/consultant/client/storage";
import type { Lead, Note } from "../../../../lib/consultant/types";

const LEAD = "11111111-1111-4111-8111-111111111111";

function note(id: string, version = 1, body = "b"): Note {
  return { id, leadId: LEAD, callId: null, kind: "manual", body, version, createdBy: "Rep", createdAt: "", updatedBy: null, updatedAt: null };
}

function fakeApi(): OutboxApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    notes: {
      create: jest.fn(async (input) => {
        calls.push(`create:${input.clientId}`);
        return note("server-note", 1, input.body);
      }),
      patch: jest.fn(async (id, patch) => {
        calls.push(`patch:${id}@${patch.baseVersion}`);
        return note(id, patch.baseVersion + 1, patch.body);
      }),
      revisions: jest.fn(async () => []),
    },
    leads: {
      patch: jest.fn(async (id, patch) => {
        calls.push(`lead:${id}:${JSON.stringify(patch)}`);
        return { id } as Lead;
      }),
    },
  };
}

describe("Outbox", () => {
  let mem: MemoryStorage;
  let now: number;
  let uuidN: number;
  const deps = (a: OutboxApi) => ({ api: a, now: () => now, random: () => 0.5, uuid: () => `00000000-0000-4000-8000-${String(++uuidN).padStart(12, "0")}` });

  beforeEach(() => {
    mem = new MemoryStorage();
    setStorageForTests(mem);
    now = 1_000_000;
    uuidN = 0;
  });
  afterAll(() => setStorageForTests(undefined));

  it("adds a clientId to note creates, persists, and survives a reload", () => {
    const box = new Outbox(deps(fakeApi()));
    const op = box.enqueue({ kind: "note.create", input: { leadId: LEAD, body: "Called, wants demo" } });
    expect(op.kind === "note.create" && op.input.clientId).toMatch(/^[0-9a-f-]{36}$/);
    expect(box.pending).toBe(1);
    const reloaded = new Outbox(deps(fakeApi()));
    expect(reloaded.pending).toBe(1);
    expect(reloaded.list()[0].id).toBe(op.id);
  });

  it("replays FIFO and empties on success", async () => {
    const api = fakeApi();
    const box = new Outbox(deps(api));
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { salesStage: "contacted" } });
    box.enqueue({ kind: "note.create", input: { leadId: LEAD, body: "x" } });
    const synced = jest.fn();
    box.onSynced(synced);
    const out = await box.flush();
    expect(out.synced).toHaveLength(2);
    expect(api.calls[0]).toMatch(/^lead:/);
    expect(api.calls[1]).toMatch(/^create:/);
    expect(box.pending).toBe(0);
    expect(synced).toHaveBeenCalledTimes(2);
  });

  it("offline: keeps the op, backs off exponentially, stops the run (order preserved)", async () => {
    const api = fakeApi();
    (api.leads.patch as jest.Mock).mockRejectedValue(new ApiClientError(0, "offline"));
    const box = new Outbox(deps(api));
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { city: "Durban" } });
    box.enqueue({ kind: "note.create", input: { leadId: LEAD, body: "x" } });
    const out = await box.flush();
    expect(out.stoppedBy).toBe("transient");
    expect(api.notes.create).not.toHaveBeenCalled();
    const [op] = box.list();
    expect(op.attempts).toBe(1);
    expect(op.nextAttemptAt).toBe(now + 1000);
    // Not yet due → nothing is attempted.
    await box.flush();
    expect(api.leads.patch).toHaveBeenCalledTimes(1);
    // Due + back online → succeeds.
    now += 1000;
    (api.leads.patch as jest.Mock).mockResolvedValue({ id: LEAD });
    await box.flush();
    expect(box.pending).toBe(0);
  });

  it("backoff doubles and caps at 60s with ±20% jitter", () => {
    expect(outboxBackoff(1, () => 0.5)).toBe(1000);
    expect(outboxBackoff(3, () => 0.5)).toBe(4000);
    expect(outboxBackoff(20, () => 0.5)).toBe(60000);
    expect(outboxBackoff(1, () => 0)).toBe(800);
    expect(outboxBackoff(1, () => 1)).toBe(1200);
  });

  it("409 on note.patch → conflict (kept, not overwritten); later ops still run", async () => {
    const api = fakeApi();
    (api.notes.patch as jest.Mock).mockRejectedValue(new ApiClientError(409, "Stale"));
    const box = new Outbox(deps(api));
    box.enqueue({ kind: "note.patch", noteId: "n1", patch: { body: "mine", baseVersion: 2 } });
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { city: "CPT" } });
    await box.flush();
    expect(box.pending).toBe(1);
    const [op] = box.list();
    expect(op.status).toBe("conflict");
    expect(op.lastError).toBe(CONFLICT_MESSAGE);
    expect(api.leads.patch).toHaveBeenCalled();
    // A second flush does not retry a conflict.
    await box.flush();
    expect(api.notes.patch).toHaveBeenCalledTimes(1);

    // User resolves: keep mine on top of v3.
    (api.notes.patch as jest.Mock).mockResolvedValue(note("n1", 4, "mine"));
    box.resolve(op.id, { action: "retry", baseVersion: 3 });
    await box.flush();
    expect(api.notes.patch).toHaveBeenLastCalledWith("n1", { body: "mine", baseVersion: 3 });
    expect(box.pending).toBe(0);
  });

  it("409 whose latest revision already equals our body is treated as done (lost response)", async () => {
    const api = fakeApi();
    (api.notes.patch as jest.Mock).mockRejectedValue(new ApiClientError(409, "Stale"));
    (api.notes.revisions as jest.Mock).mockResolvedValue([{ version: 3, body: "mine" }]);
    const box = new Outbox(deps(api));
    box.enqueue({ kind: "note.patch", noteId: "n1", patch: { body: "mine", baseVersion: 2 } });
    await box.flush();
    expect(box.pending).toBe(0);
  });

  it("discard removes a conflict", async () => {
    const api = fakeApi();
    (api.notes.patch as jest.Mock).mockRejectedValue(new ApiClientError(409, "Stale"));
    const box = new Outbox(deps(api));
    const op = box.enqueue({ kind: "note.patch", noteId: "n1", patch: { body: "x", baseVersion: 1 } });
    await box.flush();
    box.resolve(op.id, { action: "discard" });
    expect(box.pending).toBe(0);
  });

  it("401 stops the run and keeps everything queued", async () => {
    const api = fakeApi();
    (api.leads.patch as jest.Mock).mockRejectedValue(new ApiClientError(401, "Unauthorized"));
    const box = new Outbox(deps(api));
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { city: "x" } });
    const out = await box.flush();
    expect(out.stoppedBy).toBe("unauthorized");
    expect(box.list()[0].status).toBe("queued");
    expect(box.list()[0].attempts).toBe(0);
  });

  it("other 4xx → failed (kept for the user), not retried", async () => {
    const api = fakeApi();
    (api.leads.patch as jest.Mock).mockRejectedValue(new ApiClientError(422, "Enter a valid phone number"));
    const box = new Outbox(deps(api));
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { city: "x" } });
    await box.flush();
    await box.flush();
    expect(api.leads.patch).toHaveBeenCalledTimes(1);
    expect(box.list()[0]).toMatchObject({ status: "failed", lastError: "Enter a valid phone number" });
  });

  it("coalesces lead patches and note patches (keeping the original baseVersion)", () => {
    const box = new Outbox(deps(fakeApi()));
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { city: "A" } });
    box.enqueue({ kind: "lead.patch", leadId: LEAD, patch: { salesStage: "proposal", city: "B" } });
    box.enqueue({ kind: "note.patch", noteId: "n1", patch: { body: "v1", baseVersion: 2 } });
    box.enqueue({ kind: "note.patch", noteId: "n1", patch: { body: "v2", baseVersion: 3 } });
    const ops = box.list();
    expect(ops).toHaveLength(2);
    expect(ops[0]).toMatchObject({ patch: { city: "B", salesStage: "proposal" } });
    expect(ops[1]).toMatchObject({ patch: { body: "v2", baseVersion: 2 } });
  });

  it("an offline edit of an offline-created note folds into the create", () => {
    const box = new Outbox(deps(fakeApi()));
    const c = box.enqueue({ kind: "note.create", input: { leadId: LEAD, body: "first" } });
    const clientId = c.kind === "note.create" ? c.input.clientId! : "";
    box.enqueue({ kind: "note.patch", noteId: clientId, patch: { body: "edited", baseVersion: 1 } });
    expect(box.list()).toHaveLength(1);
    expect(box.list()[0]).toMatchObject({ input: { body: "edited", clientId } });
  });

  it("an edit queued while its create is in flight is remapped to the server id", async () => {
    const api = fakeApi();
    let release!: () => void;
    (api.notes.create as jest.Mock).mockImplementation(
      (input) => new Promise((r) => (release = () => r(note("srv-1", 1, input.body)))),
    );
    const box = new Outbox(deps(api));
    const c = box.enqueue({ kind: "note.create", input: { leadId: LEAD, body: "first" } });
    const clientId = c.kind === "note.create" ? c.input.clientId! : "";
    const run = box.flush();
    box.enqueue({ kind: "note.patch", noteId: clientId, patch: { body: "second", baseVersion: 1 } });
    release();
    await run;
    await box.flush();
    expect(api.notes.patch).toHaveBeenCalledWith("srv-1", { body: "second", baseVersion: 1 });
    expect(box.pending).toBe(0);
  });

  it("concurrent flush() calls share one run (no duplicate sends)", async () => {
    const api = fakeApi();
    const box = new Outbox(deps(api));
    box.enqueue({ kind: "note.create", input: { leadId: LEAD, body: "x" } });
    await Promise.all([box.flush(), box.flush(), box.flush()]);
    expect(api.notes.create).toHaveBeenCalledTimes(1);
  });
});
