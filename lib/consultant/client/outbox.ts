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
 */

import { ApiClientError, api as defaultApi } from "./api";
import { readJSON, writeJSON } from "./storage";
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
  storageKey?: string;
};

export const OUTBOX_KEY = "outbox";
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

export class Outbox {
  private ops: OutboxOp[] = [];
  private listeners = new Set<() => void>();
  private syncedListeners = new Set<(op: OutboxOp, result: OutboxResult) => void>();
  private flushing: Promise<FlushOutcome> | null = null;
  /** The op whose request is on the wire — never coalesce into it. */
  private inFlight: string | null = null;
  private readonly api: OutboxApi;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly uuid: () => string;
  private readonly key: string;

  constructor(deps: OutboxDeps = {}) {
    this.api = deps.api ?? (defaultApi as unknown as OutboxApi);
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? Math.random;
    this.uuid = deps.uuid ?? defaultUuid;
    this.key = deps.storageKey ?? OUTBOX_KEY;
    this.load();
  }

  // ── State ────────────────────────────────────────────────────────────────

  list(): OutboxOp[] {
    return this.ops;
  }

  get pending(): number {
    return this.ops.length;
  }

  get isFlushing(): boolean {
    return this.flushing !== null;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  onSynced(cb: (op: OutboxOp, result: OutboxResult) => void): () => void {
    this.syncedListeners.add(cb);
    return () => this.syncedListeners.delete(cb);
  }

  /** Reload from storage (another tab changed it). */
  load(): void {
    const raw = readJSON<OutboxOp[]>(this.key);
    this.ops = Array.isArray(raw) ? raw.filter((o) => o && typeof o.id === "string" && typeof o.kind === "string") : [];
    this.emit();
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
    // Coalesce with a still-queued op for the same entity.
    if (input.kind === "lead.patch") {
      const prev = this.ops.find((o) => o.kind === "lead.patch" && o.leadId === input.leadId && o.status === "queued" && o.id !== this.inFlight);
      if (prev && prev.kind === "lead.patch") {
        prev.patch = { ...prev.patch, ...input.patch };
        this.save();
        return prev;
      }
    }
    if (input.kind === "note.patch") {
      const create = this.ops.find((o) => o.kind === "note.create" && o.input.clientId === input.noteId && o.status !== "conflict" && o.id !== this.inFlight);
      if (create && create.kind === "note.create") {
        create.input = { ...create.input, body: input.patch.body };
        this.save();
        return create;
      }
      const prev = this.ops.find((o) => o.kind === "note.patch" && o.noteId === input.noteId && o.status === "queued" && o.id !== this.inFlight);
      if (prev && prev.kind === "note.patch") {
        prev.patch = { body: input.patch.body, baseVersion: prev.patch.baseVersion };
        this.save();
        return prev;
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
    this.ops = [...this.ops, op];
    this.save();
    return op;
  }

  remove(opId: string): void {
    const before = this.ops.length;
    this.ops = this.ops.filter((o) => o.id !== opId);
    if (this.ops.length !== before) this.save();
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
    if (op.kind === "note.patch") {
      op.patch = {
        body: resolution.body ?? op.patch.body,
        baseVersion: resolution.baseVersion ?? op.patch.baseVersion,
      };
    } else if (op.kind === "note.create" && resolution.body) {
      op.input = { ...op.input, body: resolution.body };
    }
    op.status = "queued";
    op.attempts = 0;
    op.nextAttemptAt = this.now();
    op.lastError = undefined;
    this.save();
  }

  // ── Replay ───────────────────────────────────────────────────────────────

  /** Replay eligible ops in order. Concurrent calls share one run. */
  flush(): Promise<FlushOutcome> {
    if (this.flushing) return this.flushing;
    const run = this.run().finally(() => {
      this.flushing = null;
      this.emit();
    });
    this.flushing = run;
    this.emit();
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
        this.ops = this.ops.filter((o) => o.id !== op.id);
        if (op.kind === "note.create" && op.input.clientId) this.remapClientId(op.input.clientId, result as Note);
        this.save();
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
            this.ops = this.ops.filter((o) => o.id !== op.id);
            this.save();
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
  private remapClientId(clientId: string, note: Note): void {
    if (!note || typeof note.id !== "string") return;
    this.ops = this.ops.map((o) =>
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
    this.ops = this.ops.map((o) => (o.id === op.id ? ({ ...o, ...patch } as OutboxOp) : o));
    this.save();
  }

  private save(): void {
    this.ops = [...this.ops]; // new identity for useSyncExternalStore
    writeJSON(this.key, this.ops);
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}
