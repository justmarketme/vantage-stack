/**
 * The cache behind `useQuery` — framework-free so it can be unit-tested in node.
 *
 * - One record per key, shared by every component that asks for it.
 * - In-flight requests are de-duplicated per key.
 * - `mutate` is an optimistic write; a fetch that started *before* the mutate
 *   is discarded so it can't clobber the optimistic value with older data.
 * - Persistence (localStorage) is opt-in per key and always goes through
 *   `redactForStorage`, which blanks transcripts, summaries and note bodies —
 *   those never touch disk no matter what a caller passes.
 *
 * Wave 2: the persisted part is a Zustand `persist` store named
 * `vs:consultant:v2:query-cache` (`QUERY_CACHE_PERSIST_NAME`) holding
 * `{ entries: { [key]: { t, v } } }`. Its `partialize` is the single choke
 * point to disk and re-applies every rule on each write: never-persist keys
 * are dropped, entries past PERSIST_MAX_AGE_MS are dropped, and every value is
 * passed through `redactForStorage`. Live records (errors, fetching flags,
 * de-duplication) stay in memory only. Wave-1 `vs:consultant:v1:q:*` keys are
 * deleted on start (they're only a cache — the next fetch refills it).
 */

import { createStore } from "zustand/vanilla";
import { persist } from "zustand/middleware";
import { kvPersistStorage, persistName, type PersistedStoreApi } from "./persist";
import { removePrefix } from "./storage";

export type QueryRecord = {
  data: unknown;
  hasData: boolean;
  /** When `data` was last confirmed (fetched or mutated), epoch ms. */
  updatedAt: number;
  error: Error | null;
  fetching: boolean;
  /** Data came from disk and has not been confirmed by the server this session. */
  stale: boolean;
};

export const EMPTY_RECORD: QueryRecord = Object.freeze({
  data: undefined,
  hasData: false,
  updatedAt: 0,
  error: null,
  fetching: false,
  stale: false,
}) as QueryRecord;

const LEGACY_PERSIST_NS = "q:";
export const QUERY_CACHE_PERSIST_NAME = persistName("query-cache");
export const QUERY_CACHE_PERSIST_VERSION = 1;
/** Persisted entries older than this are ignored (a week-old pipeline is misleading). */
export const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Keys (after namespacing) that are NEVER persisted, even with `persist: true`:
 * live transcripts, call detail (transcript + summary), note revisions.
 */
const NEVER_PERSIST = [/^call(s)?[:/]/, /^live[:/]/, /^note(s)?[:/]/, /^transcript/, /^revisions?[:/]/];

/** Field names whose values are blanked before anything is written to disk. */
const REDACT_FIELDS = new Set(["transcript", "segments", "summary", "notes", "body", "keyPoints", "objections"]);

export function canPersistKey(key: string): boolean {
  return !NEVER_PERSIST.some((re) => re.test(key));
}

/** Deep copy with sensitive fields blanked but type-shaped ([] / "" / null). */
export function redactForStorage(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactForStorage(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_FIELDS.has(k)) out[k] = Array.isArray(v) ? [] : typeof v === "string" ? "" : null;
    else out[k] = redactForStorage(v, depth + 1);
  }
  return out;
}

type Fetcher = { fn: () => Promise<unknown>; persist: boolean };

type DiskEntry = { t: number; v: unknown };
export type PersistedQueryCache = { entries: Record<string, DiskEntry> };

/**
 * The on-disk projection of the cache. Pure, exported for tests: whatever the
 * in-memory state holds, only this ever reaches localStorage.
 */
export function partializeQueryCache(state: PersistedQueryCache, now: number = Date.now()): PersistedQueryCache {
  const entries: Record<string, DiskEntry> = {};
  for (const [key, e] of Object.entries(state.entries ?? {})) {
    if (!canPersistKey(key) || !e || typeof e.t !== "number" || now - e.t > PERSIST_MAX_AGE_MS) continue;
    entries[key] = { t: e.t, v: redactForStorage(e.v) };
  }
  return { entries };
}

function sanitiseEntries(raw: unknown): Record<string, DiskEntry> {
  const out: Record<string, DiskEntry> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, e] of Object.entries(raw as Record<string, unknown>)) {
    const d = e as Partial<DiskEntry> | null;
    if (d && typeof d.t === "number" && canPersistKey(k)) out[k] = { t: d.t, v: d.v };
  }
  return out;
}

export class QueryStore {
  private records = new Map<string, QueryRecord>();
  private listeners = new Map<string, Set<() => void>>();
  private fetchers = new Map<string, Fetcher>();
  private inflight = new Map<string, Promise<void>>();
  /** Per key: bumped on every mutate so older in-flight results are dropped. */
  private writeSeq = new Map<string, number>();
  /** Bumped by clear() so a fetch started before logout can't repopulate. */
  private generation = 0;

  /** Persisted projection (Zustand + persist). Holds only keys fetched with `persist: true`. */
  private readonly disk: PersistedStoreApi<PersistedQueryCache, PersistedQueryCache>;

  constructor(private readonly now: () => number = Date.now) {
    removePrefix(LEGACY_PERSIST_NS);
    this.disk = createStore<PersistedQueryCache>()(
      persist<PersistedQueryCache>(() => ({ entries: {} }), {
        name: QUERY_CACHE_PERSIST_NAME,
        version: QUERY_CACHE_PERSIST_VERSION,
        storage: kvPersistStorage<PersistedQueryCache>({ isEmpty: (st) => Object.keys(st.entries).length === 0 }),
        partialize: (st) => partializeQueryCache(st, this.now()),
        merge: (persisted, current) => ({
          ...current,
          entries: sanitiseEntries((persisted as PersistedQueryCache | undefined)?.entries),
        }),
        migrate: (st) => ({ entries: sanitiseEntries((st as PersistedQueryCache | undefined)?.entries) }),
      }),
    );
  }

  subscribe(key: string, cb: () => void): () => void {
    let set = this.listeners.get(key);
    if (!set) this.listeners.set(key, (set = new Set()));
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.listeners.delete(key);
    };
  }

  hasSubscribers(key: string): boolean {
    return (this.listeners.get(key)?.size ?? 0) > 0;
  }

  mountedKeys(): string[] {
    return Array.from(this.listeners.keys());
  }

  get(key: string): QueryRecord {
    const r = this.records.get(key);
    if (r) return r;
    const fromDisk = this.readDisk(key);
    if (!fromDisk) return EMPTY_RECORD;
    this.records.set(key, fromDisk);
    return fromDisk;
  }

  setFetcher(key: string, fn: () => Promise<unknown>, persist: boolean): void {
    this.fetchers.set(key, { fn, persist: persist && canPersistKey(key) });
  }

  /** Fetch (de-duplicated). Resolves when the record is updated; never rejects. */
  revalidate(key: string): Promise<void> {
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const f = this.fetchers.get(key);
    if (!f) return Promise.resolve();
    const gen = this.generation;
    const seqAtStart = this.writeSeq.get(key) ?? 0;
    this.patch(key, { fetching: true });
    let p: Promise<void>;
    try {
      p = f
        .fn()
        .then(
          (data) => {
            if (gen !== this.generation) return;
            if ((this.writeSeq.get(key) ?? 0) !== seqAtStart) {
              // A mutate landed while we were fetching — keep the optimistic value.
              this.patch(key, { fetching: false });
              return;
            }
            const t = this.now();
            this.patch(key, { data, hasData: true, updatedAt: t, error: null, fetching: false, stale: false });
            if (f.persist) this.writeDisk(key, data, t);
          },
          (err: unknown) => {
            if (gen !== this.generation) return;
            this.patch(key, { error: err instanceof Error ? err : new Error(String(err)), fetching: false });
          },
        )
        .finally(() => {
          if (this.inflight.get(key) === p) this.inflight.delete(key);
        });
    } catch (err) {
      // fn threw synchronously
      this.patch(key, { error: err instanceof Error ? err : new Error(String(err)), fetching: false });
      return Promise.resolve();
    }
    this.inflight.set(key, p);
    return p;
  }

  isFetching(key: string): boolean {
    return this.inflight.has(key);
  }

  /** Optimistic write. `updater` receives the current data. */
  mutate<T>(key: string, updater: T | ((prev: T | undefined) => T)): T {
    const prev = this.get(key);
    const data =
      typeof updater === "function" ? (updater as (p: T | undefined) => T)(prev.data as T | undefined) : updater;
    this.writeSeq.set(key, (this.writeSeq.get(key) ?? 0) + 1);
    const t = this.now();
    this.patch(key, { data, hasData: true, updatedAt: t, error: null, stale: false });
    const f = this.fetchers.get(key);
    if (f?.persist) this.writeDisk(key, data, t);
    return data;
  }

  /** Drop matching keys: mounted ones refetch, others are forgotten. */
  invalidate(prefix: string): Promise<void> {
    const jobs: Promise<void>[] = [];
    for (const key of Array.from(this.records.keys())) {
      if (!key.startsWith(prefix)) continue;
      if (this.hasSubscribers(key)) jobs.push(this.revalidate(key));
      else this.records.delete(key);
    }
    this.dropDisk((k) => k.startsWith(prefix));
    return Promise.all(jobs).then(() => undefined);
  }

  /** Wipe memory + disk (401 / logout). */
  clear(): void {
    this.generation += 1;
    this.inflight.clear();
    this.disk.setState({ entries: {} });
    const keys = Array.from(this.records.keys());
    this.records.clear();
    this.writeSeq.clear();
    keys.forEach((k) => this.emit(k));
  }

  private patch(key: string, patch: Partial<QueryRecord>): void {
    this.records.set(key, { ...this.get(key), ...patch });
    this.emit(key);
  }

  private emit(key: string): void {
    this.listeners.get(key)?.forEach((l) => l());
  }

  private readDisk(key: string): QueryRecord | null {
    if (!canPersistKey(key)) return null;
    const hit = this.disk.getState().entries[key];
    if (!hit || typeof hit.t !== "number" || this.now() - hit.t > PERSIST_MAX_AGE_MS) return null;
    return { data: hit.v, hasData: true, updatedAt: hit.t, error: null, fetching: false, stale: true };
  }

  private writeDisk(key: string, data: unknown, t: number): void {
    if (!canPersistKey(key)) return;
    // Raw in memory; `partializeQueryCache` redacts on the way to disk.
    this.disk.setState((st) => ({ entries: { ...st.entries, [key]: { t, v: data } } }));
  }

  private dropDisk(match: (key: string) => boolean): void {
    const entries = this.disk.getState().entries;
    const keys = Object.keys(entries).filter(match);
    if (keys.length === 0) return;
    const next = { ...entries };
    for (const k of keys) delete next[k];
    this.disk.setState({ entries: next });
  }
}
