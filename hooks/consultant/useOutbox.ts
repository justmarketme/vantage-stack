"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  OUTBOX_PERSIST_NAME,
  Outbox,
  type FlushOutcome,
  type OutboxOp,
  type OutboxOpInput,
  type OutboxResult,
} from "../../lib/consultant/client/outbox";

/**
 * Offline-safe writes for notes and lead edits.
 *
 *   const { pending, enqueue, flush, conflicts, resolve } = useOutbox();
 *   enqueue({ kind: "note.create", input: { leadId, body } });           // clientId added for you
 *   enqueue({ kind: "note.patch", noteId, patch: { body, baseVersion } });
 *   enqueue({ kind: "lead.patch", leadId, patch: { salesStage: "proposal" } });
 *
 * Always safe to call — online, the op is sent immediately; offline it waits in
 * localStorage (a Zustand `persist` store, see outbox.ts) and replays on `online`, on mount, when the tab becomes visible
 * and on a backoff timer. One shared queue per tab; a Web Lock (when available)
 * stops two tabs replaying the same op. A 409 on a note edit becomes a
 * `conflict` entry the UI resolves with `resolve(id, { action: "retry" | "discard" })`.
 *
 * Listen for `consultant:outbox-synced` (detail `{ op, result }`) or use
 * `onSynced` to refresh query caches when a queued write lands.
 */

export const OUTBOX_SYNCED_EVENT = "consultant:outbox-synced";

export interface UseOutboxResult {
  pending: number;
  enqueue: (op: OutboxOpInput) => OutboxOp;
  flush: () => Promise<void>;
  /** Additive: every queued op (for a "N changes waiting" sheet). */
  ops: OutboxOp[];
  /** Additive: note edits that hit a 409 and need the user's decision. */
  conflicts: OutboxOp[];
  /** Additive: ops that failed permanently (validation etc.). */
  failed: OutboxOp[];
  resolve: Outbox["resolve"];
  remove: (opId: string) => void;
  flushing: boolean;
}

let shared: Outbox | null = null;
let installed = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

function outbox(): Outbox {
  if (!shared) shared = new Outbox();
  return shared;
}

function withLock(fn: () => Promise<FlushOutcome>): Promise<FlushOutcome | null> {
  const locks = (typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined) ?? null;
  if (!locks || typeof locks.request !== "function") return fn();
  const granted = locks.request("vs-consultant-outbox", { ifAvailable: true }, (lock) =>
    lock ? fn() : Promise.resolve(null),
  ) as unknown as Promise<FlushOutcome | null>;
  return granted.catch(() => fn());
}

function scheduleRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const at = outbox().nextRetryAt();
  if (at === null) return;
  retryTimer = setTimeout(() => void flushShared(), Math.max(250, at - Date.now()));
}

async function flushShared(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const box = outbox();
  box.load(); // pick up anything another tab wrote
  await withLock(() => box.flush());
  scheduleRetry();
}

function install(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const box = outbox();
  box.onSynced((op: OutboxOp, result: OutboxResult) => {
    try {
      window.dispatchEvent(new CustomEvent(OUTBOX_SYNCED_EVENT, { detail: { op, result } }));
    } catch {
      /* ignore */
    }
  });
  window.addEventListener("online", () => void flushShared());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void flushShared();
  });
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === null || e.key === OUTBOX_PERSIST_NAME) box.load();
  });
}

const EMPTY: OutboxOp[] = [];

export function useOutbox(): UseOutboxResult {
  const ops = useSyncExternalStore(
    (cb) => outbox().subscribe(cb),
    () => outbox().list(),
    () => EMPTY,
  );
  const flushing = useSyncExternalStore(
    (cb) => outbox().subscribe(cb),
    () => outbox().isFlushing,
    () => false,
  );

  useEffect(() => {
    install();
    void flushShared();
  }, []);

  const enqueue = useCallback((op: OutboxOpInput) => {
    const queued = outbox().enqueue(op);
    void flushShared();
    return queued;
  }, []);
  const flush = useCallback(() => flushShared(), []);
  const resolve = useCallback<Outbox["resolve"]>((id, r) => {
    outbox().resolve(id, r);
    void flushShared();
  }, []);
  const remove = useCallback((id: string) => outbox().remove(id), []);
  const conflicts = useMemo(() => ops.filter((o) => o.status === "conflict"), [ops]);
  const failed = useMemo(() => ops.filter((o) => o.status === "failed"), [ops]);

  return {
    pending: ops.length,
    enqueue,
    flush,
    ops,
    conflicts,
    failed,
    resolve,
    remove,
    flushing,
  };
}
