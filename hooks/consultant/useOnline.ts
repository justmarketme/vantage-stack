"use client";

import { useSyncExternalStore } from "react";

/**
 * `navigator.onLine`, live. SSR and the first client render report `true`
 * (optimistic — no offline banner flash on load). Note `onLine === true` only
 * means "has a network interface"; the outbox and API client still treat
 * failed requests as offline.
 */
function subscribe(cb: () => void): () => void {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

const getSnapshot = () => (typeof navigator === "undefined" ? true : navigator.onLine !== false);
const getServerSnapshot = () => true;

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
