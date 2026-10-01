/**
 * Zustand `persist` plumbing shared by every Consultant Portal store
 * (outbox, drafts, query cache, preferences).
 *
 * Why a custom storage adapter instead of `createJSONStorage(() => localStorage)`:
 * - It resolves storage LAZILY on every call through `getStorage()`, so the
 *   crash-proof guarantees of `storage.ts` still hold (Safari private mode, a
 *   full quota, SSR) and tests can swap in a `MemoryStorage` at any time.
 * - It never throws: a failed write is reported through `onWrite(false)` so the
 *   caller can decide (the outbox refuses to reload from an older disk copy;
 *   drafts report "not saved").
 * - `isEmpty` lets a store delete its key instead of writing an empty shell, so
 *   a shared device holds nothing once the queue / drafts are cleared.
 *
 * Names are versioned (`vs:consultant:v2:<store>`) — a new generation of a
 * store gets a new name and old keys are imported once then removed.
 */

import type { PersistStorage, StorageValue } from "zustand/middleware";
import type { Mutate, StoreApi } from "zustand/vanilla";
import { getStorage } from "./storage";

/** Prefix for every Zustand-persisted store (wave 2 onwards). */
export const PERSIST_PREFIX = "vs:consultant:v2:";

/** A vanilla store wrapped by `persist` (exposes `.persist.rehydrate()` etc.). */
export type PersistedStoreApi<S, P = S> = Mutate<StoreApi<S>, [["zustand/persist", P]]>;

export function persistName(store: string): string {
  return PERSIST_PREFIX + store;
}

export interface KvPersistOptions<S> {
  /** When true for the state about to be written, the key is removed instead. */
  isEmpty?: (state: S) => boolean;
  /** Told whether each write reached storage. */
  onWrite?: (ok: boolean) => void;
}

export function kvPersistStorage<S>(opts: KvPersistOptions<S> = {}): PersistStorage<S> {
  return {
    getItem(name: string): StorageValue<S> | null {
      const s = getStorage();
      if (!s) return null;
      try {
        const raw = s.getItem(name);
        if (raw == null) return null;
        const parsed = JSON.parse(raw) as StorageValue<S>;
        return parsed && typeof parsed === "object" && "state" in parsed ? parsed : null;
      } catch {
        return null; // corrupt JSON → start clean rather than crash the shell
      }
    },
    setItem(name: string, value: StorageValue<S>): void {
      const s = getStorage();
      if (!s) {
        opts.onWrite?.(false);
        return;
      }
      try {
        if (opts.isEmpty?.(value.state)) s.removeItem(name);
        else s.setItem(name, JSON.stringify(value));
        opts.onWrite?.(true);
      } catch {
        opts.onWrite?.(false);
      }
    },
    removeItem(name: string): void {
      const s = getStorage();
      if (!s) return;
      try {
        s.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Read + delete a wave-1 key (full storage key). Returns the parsed value or null. */
export function takeLegacy<T>(fullKey: string): T | null {
  const s = getStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(fullKey);
    if (raw == null) return null;
    s.removeItem(fullKey);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
