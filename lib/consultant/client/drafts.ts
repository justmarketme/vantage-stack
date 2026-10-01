/**
 * Local note drafts — survive signal loss, reloads and iOS tab eviction.
 *
 * Wave 2: every draft lives in ONE Zustand `persist` store under
 * `vs:consultant:v2:drafts` (`DRAFTS_PERSIST_NAME`) as
 * `{ drafts: { [key]: { v, t } } }`. Drafts older than DRAFT_TTL_MS are pruned
 * so stale text doesn't linger on a shared device, and the key is deleted
 * outright once no drafts remain.
 *
 * A draft is text the rep TYPED (never a transcript or AI summary) — keeping it
 * on the device is the whole point. Nothing here is logged.
 *
 * Cross-tab safety: the blob is shared by every tab, so each read and write
 * first re-reads disk (`rehydrate`, synchronous for localStorage). Without it,
 * tab B would write its stale copy back and resurrect a draft tab A cleared.
 *
 * The public functions are unchanged from wave 1; wave-1 per-key drafts
 * (`vs:consultant:v1:draft:<key>`) are imported once and deleted.
 */

import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import { kvPersistStorage, persistName, type PersistedStoreApi } from "./persist";
import { getStorage, listKeys, readJSON, removeKey, type KVStorage } from "./storage";

export const DRAFT_NS = "draft:";
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const DRAFTS_PERSIST_NAME = persistName("drafts");
export const DRAFTS_PERSIST_VERSION = 1;

type Stored = { v: string; t: number };
export type DraftsState = { drafts: Record<string, Stored> };

function sanitise(raw: unknown): Record<string, Stored> {
  const out: Record<string, Stored> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, e] of Object.entries(raw as Record<string, unknown>)) {
    const s = e as Partial<Stored> | null;
    if (s && typeof s.v === "string" && typeof s.t === "number") out[k] = { v: s.v, t: s.t };
  }
  return out;
}

type Holder = { storage: KVStorage; store: PersistedStoreApi<DraftsState, DraftsState>; writeOk: boolean };
let holder: Holder | null = null;

/**
 * The store bound to the CURRENT storage. Re-created if storage changes
 * (tests inject a fresh MemoryStorage). Null when storage is unavailable —
 * then drafts are simply not kept (same as wave 1).
 */
function drafts(): Holder | null {
  const s = getStorage();
  if (!s) return null;
  if (holder && holder.storage === s) return holder;
  const h = { storage: s, writeOk: true } as Holder;
  h.store = createStore<DraftsState>()(
    persist<DraftsState>(() => ({ drafts: {} }), {
      name: DRAFTS_PERSIST_NAME,
      version: DRAFTS_PERSIST_VERSION,
      storage: kvPersistStorage<DraftsState>({
        isEmpty: (st) => Object.keys(st.drafts).length === 0,
        onWrite: (ok) => (h.writeOk = ok),
      }),
      partialize: (st) => ({ drafts: st.drafts }),
      // Missing key on disk means "no drafts" (another tab may have cleared them).
      merge: (persisted, current) => ({ ...current, drafts: sanitise((persisted as DraftsState | undefined)?.drafts) }),
      migrate: (st) => ({ drafts: sanitise((st as DraftsState | undefined)?.drafts) }),
    }),
  );
  holder = h;
  importLegacy(h);
  return h;
}

function importLegacy(h: Holder): void {
  const keys = listKeys(DRAFT_NS);
  if (keys.length === 0) return;
  const next = { ...h.store.getState().drafts };
  for (const k of keys) {
    const hit = readJSON<Stored>(k);
    const name = k.slice(DRAFT_NS.length);
    if (hit && typeof hit.v === "string" && typeof hit.t === "number" && !next[name]) next[name] = hit;
    removeKey(k);
  }
  h.store.setState({ drafts: next });
}

/** Re-read disk, apply `fn`, write. Returns whether the write reached storage. */
function update(h: Holder, fn: (d: Record<string, Stored>) => Record<string, Stored>): boolean {
  void h.store.persist.rehydrate();
  h.store.setState({ drafts: fn(h.store.getState().drafts) });
  return h.writeOk;
}

function without(d: Record<string, Stored>, key: string): Record<string, Stored> {
  if (!(key in d)) return d;
  const next = { ...d };
  delete next[key];
  return next;
}

export function readDraft(key: string, now = Date.now()): { value: string; savedAt: number } | null {
  const h = drafts();
  if (!h) return null;
  void h.store.persist.rehydrate();
  const hit = h.store.getState().drafts[key];
  if (!hit) return null;
  if (now - hit.t > DRAFT_TTL_MS) {
    update(h, (d) => without(d, key));
    return null;
  }
  return { value: hit.v, savedAt: hit.t };
}

/** Empty drafts are removed rather than stored. Returns the save time, or null. */
export function writeDraft(key: string, value: string, now = Date.now()): number | null {
  const h = drafts();
  if (!h) return null;
  if (!value || !value.trim()) {
    update(h, (d) => without(d, key));
    return null;
  }
  return update(h, (d) => ({ ...d, [key]: { v: value, t: now } })) ? now : null;
}

export function clearDraft(key: string): void {
  const h = drafts();
  if (h) update(h, (d) => without(d, key));
}

export function pruneDrafts(now = Date.now()): number {
  const h = drafts();
  if (!h) return 0;
  let n = 0;
  update(h, (d) => {
    const next: Record<string, Stored> = {};
    for (const [k, e] of Object.entries(d)) {
      if (now - e.t > DRAFT_TTL_MS) n++;
      else next[k] = e;
    }
    return n ? next : d;
  });
  return n;
}
