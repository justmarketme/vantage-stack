/**
 * Offline outbox — a persisted FIFO of writes that replays when the network
 * returns. Framework-free (unit-tested with fake storage + fake API).
 *
 * Ops:
 *   note.create  — carries `clientId` (crypto.randomUUID) so a replay is idempotent.
 *   note.patch   — carries `baseVersion`; a 409 marks the op `conflict` (kept, never
 *                  overwritten) so the UI can show "someone else edited this note".
 *   lead.patch   — plain partial update.
 *
 * Replay rules:
 * - Strict FIFO. A transient failure (offline, timeout, 429, 5xx) stops the run and
 *   schedules a retry with exponential backoff (1s → 60s, ±20% jitter).
 * - 401 stops the run and leaves everything queued for after re-login.
 * - Other 4xx → op marked `failed` (kept for the user to fix or discard).
 * - Before marking a note.patch as conflict, the latest revision is checked: if it
 *   already equals our body (a previous replay landed but the response was lost),
 *   the op is treated as done.
 * - Coalescing while queued: repeated lead.patch on one lead merge; repeated
 *   note.patch on one note merge (keeping the ORIGINAL baseVersion); a note.patch
 *   on a note that is itself still a queued note.create (keyed by clientId) folds
 *   into the create.
 *
 * Storage (wave 2): the queue is a Zustand vanilla store with the `persist`
 * middleware under `vs:consultant:v2:outbox` (`OUTBOX_PERSIST_NAME`).
 * `partialize` writes ONLY `ops` — runtime flags such as `flushing` never touch
 * disk. The outbox is the one place (with drafts) where a note body the rep
 * TYPED is kept on the device: that is its whole purpose (offline-first), and
 * it is removed the moment the server confirms the write. Transcripts,
 * summaries and objections are never enqueued. A wave-1 queue
 * (`vs:consultant:v1:outbox`) is imported once and its key deleted, so nothing
 * queued before the upgrade is lost.
 */

import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import { ApiClientError, api as defaultApi } from "./api";
import { kvPersistStorage, persistName, type PersistedStoreApi, takeLegacy } from "./persist";
import { storageKey as legacyStorageKey } from "./storage";
import type { Lead, LeadPatch, Note, NoteInput, NotePatch } from "../types";

export type OutboxOpInput =
  | { kind: "note.create"; input: NoteInput }
  | { kind: "note.patch"; noteId: string; patch: NotePatch; leadId?: string }
  | { kind: "lead.patch"; leadId: string; patch: LeadPatch };

export type OutboxStatus = "queued" | "conflict" | "failed";

export type OutboxOp = OutboxOpInput & {
  id: string;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: OutboxStatus;
  /** User-facing reason for conflict/failed/backoff. */
  lastError?: string;
};

export type OutboxResult = Note | Lead;

export type OutboxApi = {
  notes: {
    create: (input: NoteInput) => Promise<Note>;
    patch: (id: string, patch: NotePatch) => Promise<Note>;
    revisions: (id: string) => Promise<{ version: number; body: string }[]>;
  };
  leads: { patch: (id: string, patch: LeadPatch) => Promise<Lead> };
};

export type OutboxDeps = {
  api?: OutboxApi;
  now?: () => number;
  random?: () => number;
  uuid?: () => string;
  /** Store name suffix (tests / multiple queues). Default "outbox". */
  storageKey?: string;
};

export const OUTBOX_KEY = "outbox";
/** Full localStorage key of the persisted queue (for cross-tab `storage` events). */
export const OUTBOX_PERSIST_NAME = persistName(OUTBOX_KEY);
export const OUTBOX_PERSIST_VERSION = 1;
export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_CAP_MS = 60_000;
export const CONFLICT_MESSAGE = "Someone else edited this note while you were offline.";

export function outboxBackoff(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  const jitter = 0.8 + random() * 0.4; // ±20%
  return Math.round(base * jitter);
}

function defaultUuid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // RFC4122 v4 fallback (older Safari).
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type FlushOutcome = { synced: { op: OutboxOp; result: OutboxResult }[]; stoppedBy?: "transient" | "unauthorized" };

/** In-memory shape of the Zustand store. Only `ops` is persisted. */
export type OutboxState = { ops: OutboxOp[]; flushing: boolean };
type PersistedOutbox = { ops: OutboxOp[] };

function sanitiseOps(raw: unknown): OutboxOp[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.filter((o): o is OutboxOp => !!o && typeof o.id === "string" && typeof o.kind === "string");
}

export class Outbox {
  /** The Zustand store (exposed so hooks can use `useStore` selectors). */
  readonly store: PersistedStoreApi<OutboxState, PersistedOutbox>;
  private syncedListeners = new Set<(op: OutboxOp, result: OutboxResult) => void>();
  private flushRun: Promise<FlushOutcome> | null = null;
  /** The op whose request is on the wire — never coalesce into it. */
  private inFlight: string | null = null;
  /** False after a write that didn't reach storage — then memory is the only truth. */
  private diskInSync = true;
  private readonly api: OutboxApi;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly uuid: () => string;

  constructor(deps: OutboxDeps = {}) {
    this.api = deps.api ?? (defaultApi as unknown as OutboxApi);
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.uuid = deps.uuid ?? defaultUuid;
    const key = deps.storageKey ?? OUTBOX_KEY;

    this.store = createStore<OutboxState>()(
      persist<OutboxState, [], [], PersistedOutbox>(() => ({ ops: [], flushing: false }), {
        name: persistName(key),
        version: OUTBOX_PERSIST_VERSION,
        storage: kvPersistStorage<PersistedOutbox>({ onWrite: (ok) => (this.diskInSync = ok) }),
        partialize: (s) => ({ ops: s.ops }),
        // Keep the current array identity when disk says the same thing, so a
        // reload from another tab doesn't re-render every subscriber for nothing.
        merge: (persisted, current) => {
          const ops = sanitiseOps((persisted as PersistedOutbox | undefined)?.ops);
          if (!ops) return current;
          return JSON.stringify(ops) === JSON.stringify(current.ops) ? current : { ...current, ops };
        },
        migrate: (state) => ({ ops: sanitiseOps((state as PersistedOutbox | undefined)?.ops) ?? [] }),
      }),
    );

    // One-time import of a wave-1 queue.
    const legacy = sanitiseOps(takeLegacy<unknown>(legacyStorageKey(key)));
    if (legacy && legacy.length) {
      const have = new Set(this.ops.map((o) => o.id));
      this.commit([...this.ops, ...legacy.filter((o) => !have.has(o.id))]);
    }
  }

  // ── State ────────────────────────────────────────────────────────────────

  private get ops(): OutboxOp[] {
    return this.store.getState().ops;
  }

  /** Replace the queue (new array identity → subscribers + disk). */
  private commit(ops: OutboxOp[]): void {
    this.store.setState({ ops: [...ops] });
  }

  list(): OutboxOp[] {
    return this.ops;
  }

  get pending(): number {
    return this.ops.length;
  }

  get isFlushing(): boolean {
    return this.store.getState().flushing;
  }

  subscribe(cb: () => void): () => void {
    return this.store.subscribe(() => cb());
  }

  onSynced(cb: (op: OutboxOp, result: OutboxResult) => void): () => void {
    this.syncedListeners.add(cb);
    return () => this.syncedListeners.delete(cb);
  }

  /**
   * Reload from storage (another tab changed it). Skipped while our own last
   * write failed (quota / private mode): disk would be OLDER than memory and
   * reloading it would silently drop queued notes.
   */
  load(): void {
    if (!this.diskInSync) return;
    void this.store.persist.rehydrate();
  }

  /** Earliest time a queued op becomes eligible, or null. */
  nextRetryAt(): number | null {
    let t: number | null = null;
    for (const o of this.ops) if (o.status === "queued" && (t === null || o.nextAttemptAt < t)) t = o.nextAttemptAt;
    return t;
  }

  // ── Mutations ────────────────────────────────────────────────────────────

  enqueue(input: OutboxOpInput): OutboxOp {
    const now = this.now();
    const ops = this.ops;
    // Coalesce with a still-queued op for the same entity.
    if (input.kind === "lead.patch") {
      const prev = ops.find((o) => o.kind === "lead.patch" && o.leadId === input.leadId && o.status === "queued" && o.id !== this.inFlight);
      if (prev && prev.kind === "lead.patch") {
        return this.replace(prev, { ...prev, patch: { ...prev.patch, ...input.patch } });
      }
    }
    if (input.kind === "note.patch") {
      const create = ops.find((o) => o.kind === "note.create" && o.input.clientId === input.noteId && o.status !== "conflict" && o.id !== this.inFlight);
      if (create && create.kind === "note.create") {
        return this.replace(create, { ...create, input: { ...create.input, body: input.patch.body } });
      }
      const prev = ops.find((o) => o.kind === "note.patch" && o.noteId === input.noteId && o.status === "queued" && o.id !== this.inFlight);
      if (prev && prev.kind === "note.patch") {
        return this.replace(prev, { ...prev, patch: { body: input.patch.body, baseVersion: prev.patch.baseVersion } });
      }
    }
    const op = {
      ...(input.kind === "note.create"
        ? { ...input, input: { ...input.input, clientId: input.input.clientId ?? this.uuid() } }
        : input),
      id: this.uuid(),
      createdAt: now,
      attempts: 0,
      nextAttemptAt: now,
      status: "queued" as const,
    } as OutboxOp;
    this.commit([...ops, op]);
    return op;
  }

  private replace(prev: OutboxOp, next: OutboxOp): OutboxOp {
    this.commit(this.ops.map((o) => (o.id === prev.id ? next : o)));
    return next;
  }

  remove(opId: string): void {
    const next = this.ops.filter((o) => o.id !== opId);
    if (next.length !== this.ops.length) this.commit(next);
  }

  /**
   * Resolve a conflicted/failed op.
   * - `discard`: drop my change.
   * - `retry`: keep my change on top of `baseVersion` (the version the user has
   *   now seen), optionally with an edited `body`. Requeued at the front.
   */
  resolve(opId: string, resolution: { action: "discard" } | { action: "retry"; baseVersion?: number; body?: string }): void {
    const op = this.ops.find((o) => o.id === opId);
    if (!op) return;
    if (resolution.action === "discard") {
      this.remove(opId);
      return;
    }
    let next: OutboxOp = op;
    if (op.kind === "note.patch") {
      next = {
        ...op,
        patch: {
          body: resolution.body ?? op.patch.body,
          baseVersion: resolution.baseVersion ?? op.patch.baseVersion,
        },
      };
    } else if (op.kind === "note.create" && resolution.body) {
      next = { ...op, input: { ...op.input, body: resolution.body } };
    }
    this.replace(op, { ...next, status: "queued", attempts: 0, nextAttemptAt: this.now(), lastError: undefined });
  }

  // ── Replay ───────────────────────────────────────────────────────────────

  /** Replay eligible ops in order. Concurrent calls share one run. */
  flush(): Promise<FlushOutcome> {
    if (this.flushRun) return this.flushRun;
    const run = this.run().finally(() => {
      this.flushRun = null;
      this.store.setState({ flushing: false });
    });
    this.flushRun = run;
    this.store.setState({ flushing: true });
    return run;
  }

  private async run(): Promise<FlushOutcome> {
    const synced: FlushOutcome["synced"] = [];
    // Snapshot ids: ops enqueued mid-run are picked up by the next flush.
    for (const id of this.ops.map((o) => o.id)) {
      const op = this.ops.find((o) => o.id === id);
      if (!op || op.status !== "queued") continue;
      if (op.nextAttemptAt > this.now()) return { synced, stoppedBy: "transient" }; // keep FIFO order
      this.inFlight = op.id;
      try {
        const result = await this.exec(op);
        this.inFlight = null;
        let next = this.ops.filter((o) => o.id !== op.id);
        if (op.kind === "note.create" && op.input.clientId) next = this.remapClientId(next, op.input.clientId, result as Note);
        this.commit(next);
        synced.push({ op, result });
        this.syncedListeners.forEach((l) => {
          try {
            l(op, result);
          } catch {
            /* listener bugs must not break replay */
          }
        });
      } catch (err) {
        this.inFlight = null;
        const e = err instanceof ApiClientError ? err : new ApiClientError(0, "Couldn't reach the server.");
        if (e.status === 401) return { synced, stoppedBy: "unauthorized" };
        if (e.status === 409 && op.kind === "note.patch") {
          if (await this.alreadyApplied(op)) {
            this.remove(op.id);
            continue;
          }
          this.mark(op, { status: "conflict", lastError: CONFLICT_MESSAGE });
          continue;
        }
        if (e.isTransient) {
          const attempts = op.attempts + 1;
          this.mark(op, {
            attempts,
            nextAttemptAt: this.now() + outboxBackoff(attempts, this.random),
            lastError: e.error,
          });
          return { synced, stoppedBy: "transient" };
        }
        this.mark(op, { status: "failed", attempts: op.attempts + 1, lastError: e.error });
      }
    }
    return { synced };
  }

  /** Edits queued against an offline-created note (keyed by clientId) now target the real id. */
  private remapClientId(ops: OutboxOp[], clientId: string, note: Note): OutboxOp[] {
    if (!note || typeof note.id !== "string") return ops;
    return ops.map((o) =>
      o.kind === "note.patch" && o.noteId === clientId
        ? { ...o, noteId: note.id, patch: { ...o.patch, baseVersion: note.version ?? o.patch.baseVersion } }
        : o,
    );
  }

  private exec(op: OutboxOp): Promise<OutboxResult> {
    switch (op.kind) {
      case "note.create":
        return this.api.notes.create(op.input);
      case "note.patch":
        return this.api.notes.patch(op.noteId, op.patch);
      case "lead.patch":
        return this.api.leads.patch(op.leadId, op.patch);
    }
  }

  private async alreadyApplied(op: Extract<OutboxOp, { kind: "note.patch" }>): Promise<boolean> {
    try {
      const revs = await this.api.notes.revisions(op.noteId);
      const latest = revs?.[0];
      return !!latest && latest.version > op.patch.baseVersion && latest.body.trim() === op.patch.body.trim();
    } catch {
      return false;
    }
  }

  private mark(op: OutboxOp, patch: Partial<OutboxOp>): void {
    this.commit(this.ops.map((o) => (o.id === op.id ? ({ ...o, ...patch } as OutboxOp) : o)));
  }
}
