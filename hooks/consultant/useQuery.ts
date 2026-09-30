"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { UNAUTHORIZED_EVENT } from "../../lib/consultant/client/api";
import { EMPTY_RECORD, QueryStore } from "../../lib/consultant/client/queryStore";

/**
 * Stale-while-revalidate data hook.
 *
 *   const { data, error, loading, refresh, mutate } =
 *     useQuery("leads:mine", () => api.leads.list({ scope: "mine" }), { persist: true, refreshMs: 30_000 });
 *
 * - `key: null` disables the query (e.g. waiting for an id).
 * - Cached data renders instantly (memory, then localStorage when `persist`)
 *   while a fresh fetch runs; `stale` is true until the server confirms it.
 * - Requests are de-duplicated per key across components.
 * - `refreshMs` polls, but only while the tab is visible; returning to the tab,
 *   window focus and coming back online all revalidate immediately.
 * - `persist` is for lists/leads only. Keys starting `call:`, `live:`, `note:`,
 *   `revisions:` are never persisted, and transcripts / summaries / note bodies
 *   are blanked before any write (see queryStore.ts).
 * - Everything is wiped on `consultant:unauthorized`.
 */

export interface UseQueryOptions {
  /** Poll interval while the tab is visible. 0/undefined = no polling. */
  refreshMs?: number;
  /** Mirror to localStorage (lists / leads only). Default false. */
  persist?: boolean;
  /** Skip the mount fetch if data is younger than this. Default 5s. */
  freshMs?: number;
}

export interface UseQueryResult<T> {
  data: T | undefined;
  error: Error | null;
  /** True only while there is nothing to show yet. */
  loading: boolean;
  refresh: () => Promise<void>;
  /**
   * Optimistic update. Returns the new value. Pass `{ revalidate: true }` to
   * confirm against the server afterwards.
   */
  mutate: (updater: T | ((prev: T | undefined) => T), opts?: { revalidate?: boolean }) => T;
  /** Additive: data is from cache and not yet confirmed by the server. */
  stale: boolean;
  /** Additive: a request is in flight (including background revalidation). */
  fetching: boolean;
}

/** Shared cache. Exported so the outbox/UI can `queryStore.mutate(...)` other keys. */
export const queryStore = new QueryStore();

export function invalidateQueries(prefix: string): Promise<void> {
  return queryStore.invalidate(prefix);
}

export function setQueryData<T>(key: string, updater: T | ((prev: T | undefined) => T)): T {
  return queryStore.mutate(key, updater);
}

export function clearQueryCache(): void {
  queryStore.clear();
}

let globalsInstalled = false;
function installGlobals(): void {
  if (globalsInstalled || typeof window === "undefined") return;
  globalsInstalled = true;
  const revalidateMounted = () => {
    for (const key of queryStore.mountedKeys()) void queryStore.revalidate(key);
  };
  window.addEventListener("focus", revalidateMounted);
  window.addEventListener("online", revalidateMounted);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") revalidateMounted();
  });
  window.addEventListener(UNAUTHORIZED_EVENT, () => queryStore.clear());
}

const DEFAULT_FRESH_MS = 5_000;

export function useQuery<T>(
  key: string | null,
  fn: () => Promise<T>,
  opts: UseQueryOptions = {},
): UseQueryResult<T> {
  const { refreshMs, persist = false, freshMs = DEFAULT_FRESH_MS } = opts;
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const subscribe = useCallback(
    (cb: () => void) => (key ? queryStore.subscribe(key, cb) : () => undefined),
    [key],
  );
  const rec = useSyncExternalStore(
    subscribe,
    () => (key ? queryStore.get(key) : EMPTY_RECORD),
    () => EMPTY_RECORD,
  );

  // Register fetcher + mount fetch.
  useEffect(() => {
    installGlobals();
    if (!key) return;
    queryStore.setFetcher(key, () => fnRef.current(), persist);
    const r = queryStore.get(key);
    if (!r.hasData || r.stale || Date.now() - r.updatedAt > freshMs) void queryStore.revalidate(key);
  }, [key, persist, freshMs]);

  // Visible-only polling. setTimeout chain so a slow request never overlaps the next.
  useEffect(() => {
    if (!key || !refreshMs || refreshMs <= 0 || typeof document === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(tick, refreshMs);
    };
    const tick = () => {
      timer = null;
      if (cancelled) return;
      if (document.visibilityState !== "visible") return; // resumes on visibilitychange
      void queryStore.revalidate(key).finally(schedule);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && timer === null) schedule();
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [key, refreshMs]);

  const refresh = useCallback(() => (key ? queryStore.revalidate(key) : Promise.resolve()), [key]);

  const mutate = useCallback(
    (updater: T | ((prev: T | undefined) => T), mOpts?: { revalidate?: boolean }): T => {
      if (!key) return (typeof updater === "function" ? (updater as (p: T | undefined) => T)(undefined) : updater);
      const next = queryStore.mutate<T>(key, updater);
      if (mOpts?.revalidate) void queryStore.revalidate(key);
      return next;
    },
    [key],
  );

  return {
    data: rec.data as T | undefined,
    error: rec.error,
    loading: key !== null && !rec.hasData && rec.error === null,
    refresh,
    mutate,
    stale: rec.hasData && rec.stale,
    fetching: rec.fetching,
  };
}
