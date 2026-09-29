"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LOGOUT_EVENT, UNAUTHORIZED_EVENT } from "./api";
import { CACHE_CONFIG, PersistentCache } from "./cache";
import { clearPersistedClientState, getStorage } from "./storage";

/**
 * Stale-while-revalidate data hooks.
 *
 *   const { data, error, loading, stale, refresh } = useQuery("patients", () => api.patients.list());
 *
 * - Cached data (memory, then localStorage) renders instantly with `stale: true`
 *   while a fresh fetch runs. Revalidates on mount, window focus, and `online`.
 * - Keys: use `"<resource>"` or `"<resource>:<param>"` so `invalidate("<resource>")`
 *   hits every variant. Persisted keys are namespaced `vsc:v1:<clinicId>:q:<key>`.
 * - POPIA: pass `{ persist: false }` for anything with clinical content. The keys
 *   "conversations", "conversation:*", "messages*", "patient:*", "patient-export:*"
 *   are memory-only no matter what (see cache.ts). All caches are wiped on
 *   logout and on any 401.
 * - Cross-tab: another tab's writes/evictions arrive via the `storage` event.
 */

export interface QueryOptions {
  /** Write to localStorage (default true; forced false for PII keys). */
  persist?: boolean;
  /** Skip fetching while false (e.g. waiting for an id). */
  enabled?: boolean;
  /** Don't refetch on mount if data is younger than this. */
  freshMs?: number;
}

export interface QueryResult<T> {
  data: T | undefined;
  error: Error | null;
  /** True while fetching with nothing to show yet. */
  loading: boolean;
  /** True when `data` came from cache and has not been confirmed by the server this session. */
  stale: boolean;
  refresh: () => Promise<void>;
}

interface Rec {
  data: unknown;
  t: number;
  hasData: boolean;
  error: Error | null;
  fetching: boolean;
  stale: boolean;
}

const EMPTY: Rec = Object.freeze({ data: undefined, t: 0, hasData: false, error: null, fetching: false, stale: false });

const persistent = new PersistentCache(getStorage("local"));
const records = new Map<string, Rec>();
const listeners = new Map<string, Set<() => void>>();
const fetchers = new Map<string, { fn: () => Promise<unknown>; persist: boolean }>();
const inflight = new Map<string, Promise<void>>();
/** Bumped by clears so a fetch started before logout can't repopulate the cache. */
let generation = 0;

function emit(key: string): void {
  listeners.get(key)?.forEach((l) => l());
}

function setRec(key: string, patch: Partial<Rec>): void {
  records.set(key, { ...(records.get(key) ?? EMPTY), ...patch });
  emit(key);
}

function readRec(key: string): Rec {
  const r = records.get(key);
  if (r) return r;
  const hit = persistent.read(key);
  if (!hit) return EMPTY;
  const rec: Rec = { data: hit.v, t: hit.t, hasData: true, error: null, fetching: false, stale: true };
  records.set(key, rec);
  return rec;
}

function revalidate(key: string): Promise<void> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const f = fetchers.get(key);
  if (!f) return Promise.resolve();
  const gen = generation;
  setRec(key, { ...readRec(key), fetching: true });
  const p = f
    .fn()
    .then(
      (data) => {
        if (gen !== generation) return;
        const t = Date.now();
        setRec(key, { data, t, hasData: true, error: null, fetching: false, stale: false });
        if (f.persist) persistent.write(key, data, t);
      },
      (err: unknown) => {
        if (gen !== generation) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setRec(key, { error, fetching: false });
      },
    )
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** Scope persisted cache to a clinic (SessionProvider calls this). `null` = no persistence. */
export function setCacheScope(clinicId: string | null): void {
  persistent.setScope(clinicId);
}

/** Mark matching keys stale; refetch the mounted ones, drop the rest. */
export function invalidate(prefix: string): Promise<void> {
  const jobs: Promise<void>[] = [];
  for (const key of Array.from(records.keys())) {
    if (!key.startsWith(prefix)) continue;
    if (listeners.get(key)?.size) {
      setRec(key, { t: 0, stale: true });
      jobs.push(revalidate(key));
    } else {
      records.delete(key);
    }
  }
  persistent.removePrefix(prefix);
  return Promise.all(jobs).then(() => undefined);
}

/** Seed / optimistic update: `setQueryData("goals", (g) => [...g, created])`. */
export function setQueryData<T>(key: string, updater: T | ((prev: T | undefined) => T)): void {
  const prev = readRec(key);
  const data =
    typeof updater === "function" ? (updater as (p: T | undefined) => T)(prev.data as T | undefined) : updater;
  const t = Date.now();
  setRec(key, { data, t, hasData: true, error: null, stale: false });
  if (fetchers.get(key)?.persist ?? true) persistent.write(key, data, t);
}

/** POPIA wipe: memory + localStorage cache + session continuity mirrors. */
export function clearQueryCache(): void {
  generation += 1;
  inflight.clear();
  persistent.clearAll();
  clearPersistedClientState();
  const keys = Array.from(records.keys());
  records.clear();
  keys.forEach(emit);
}

// ── Global listeners (installed once, browser only) ─────────────────────────

let installed = false;
function installGlobalListeners(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const revalidateMounted = () => {
    listeners.forEach((set, key) => {
      if (set.size) void revalidate(key);
    });
  };
  window.addEventListener("focus", revalidateMounted);
  window.addEventListener("online", revalidateMounted);
  try {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revalidateMounted();
    });
  } catch {
    /* ignore */
  }
  window.addEventListener(UNAUTHORIZED_EVENT, clearQueryCache);
  window.addEventListener(LOGOUT_EVENT, clearQueryCache);
  window.addEventListener("storage", (e: StorageEvent) => {
    if (e.key === null) {
      // storage.clear() in another tab
      const keys = Array.from(records.keys());
      records.clear();
      keys.forEach(emit);
      return;
    }
    const key = persistent.queryKeyOf(e.key);
    if (!key) return;
    const entry = persistent.parse(e.newValue);
    if (!entry) {
      records.delete(key);
      emit(key);
      return;
    }
    // The other tab's copy is redacted; keep ours if it is at least as new.
    const mine = records.get(key);
    if (mine?.hasData && mine.t >= entry.t) return;
    setRec(key, { data: entry.v, t: entry.t, hasData: true, error: null, stale: true });
    if (listeners.get(key)?.size) void revalidate(key);
  });
}

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useQuery<T>(key: string | null, fn: () => Promise<T>, opts: QueryOptions = {}): QueryResult<T> {
  const enabled = key !== null && opts.enabled !== false;
  const persist = opts.persist !== false;
  const freshMs = opts.freshMs ?? CACHE_CONFIG.freshMs;
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const subscribe = useCallback(
    (cb: () => void) => {
      if (!key) return () => undefined;
      let set = listeners.get(key);
      if (!set) listeners.set(key, (set = new Set()));
      set.add(cb);
      return () => {
        set!.delete(cb);
      };
    },
    [key],
  );
  const rec = useSyncExternalStore(
    subscribe,
    () => (key ? readRec(key) : EMPTY),
    () => EMPTY,
  );

  useEffect(() => {
    installGlobalListeners();
    if (!key || !enabled) return;
    fetchers.set(key, { fn: () => fnRef.current(), persist });
    const r = readRec(key);
    if (!r.hasData || r.stale || Date.now() - r.t > freshMs) void revalidate(key);
  }, [key, enabled, persist, freshMs]);

  const refresh = useCallback(() => (key && enabled ? revalidate(key) : Promise.resolve()), [key, enabled]);

  return {
    data: rec.data as T | undefined,
    error: rec.error,
    loading: enabled && !rec.hasData && (rec.fetching || rec.error === null),
    stale: rec.hasData && rec.stale,
    refresh,
  };
}

export interface MutationResult<A extends unknown[], R> {
  /** Resolves with the result; rejects (after setting `error`) so callers can react. */
  run: (...args: A) => Promise<R>;
  pending: boolean;
  error: Error | null;
  reset: () => void;
}

export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>): MutationResult<A, R> {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args: A) => {
    setPending(true);
    setError(null);
    try {
      return await fnRef.current(...args);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e : new Error(String(e)));
      throw e;
    } finally {
      if (mounted.current) setPending(false);
    }
  }, []);

  const reset = useCallback(() => setError(null), []);
  return { run, pending, error, reset };
}
