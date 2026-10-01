"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { OUTBOX_SYNCED_EVENT } from "../../hooks/consultant/useOutbox";

/** SSR-safe media query (false on the server and first paint). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => (typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(query).matches),
    () => false,
  );
}

/** ≥1024px — the three-column / kanban / side-rail breakpoint. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

/** Run `cb` whenever a queued (outbox) write lands on the server. */
export function useOutboxSynced(cb: () => void): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const on = () => ref.current();
    window.addEventListener(OUTBOX_SYNCED_EVENT, on);
    return () => window.removeEventListener(OUTBOX_SYNCED_EVENT, on);
  }, []);
}

/** Debounced copy of a value. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
