"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Registers the Consultant Portal service worker (`public/consultant-sw.js`)
 * so the portal shell and Coach Alex's deck open with no signal.
 *
 *   const sw = useServiceWorker();          // call once, in the portal shell
 *   {sw.updateReady && <button onClick={sw.applyUpdate}>Update available</button>}
 *
 * - Production only. In development it registers nothing and unregisters a
 *   stale portal worker, so `next dev` never serves cached code.
 * - Registered after the page has loaded (idle), never competing with first paint.
 * - Scope `/consultant` (see SW_SCOPE for why not `/consultant/`).
 * - The build id versions the caches: `NEXT_PUBLIC_BUILD_ID`, else Vercel's
 *   `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, else "0" (static files are
 *   content-hashed, so a missing id costs only cache housekeeping, never
 *   correctness).
 * - A new deploy is NOT swapped in under the rep's feet (e.g. mid-call):
 *   `updateReady` flips true and the UI calls `applyUpdate()` when convenient;
 *   the page reloads once the new worker takes control.
 * - `clearCaches()` wipes the portal caches (e.g. on sign-out of a shared device).
 */

export const SW_URL = "/consultant-sw.js";
/**
 * `/consultant` rather than `/consultant/`: a `/consultant/` scope would NOT
 * control the dashboard itself (`/consultant` has no trailing slash in Next),
 * so the most-opened page would have no offline support.
 */
export const SW_SCOPE = "/consultant";

export function swBuildVersion(): string {
  const raw =
    process.env.NEXT_PUBLIC_BUILD_ID || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "0";
  const v = raw.trim().slice(0, 64).replace(/[^A-Za-z0-9._-]/g, "");
  return v || "0";
}

export interface UseServiceWorkerResult {
  /** Browser supports service workers and this is a production build. */
  supported: boolean;
  /** The worker is registered (and will control the next load if not already). */
  registered: boolean;
  /** A new version is installed and waiting. */
  updateReady: boolean;
  applyUpdate: () => void;
  clearCaches: () => void;
}

function swContainer(): ServiceWorkerContainer | null {
  return typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker : null;
}

export function useServiceWorker(): UseServiceWorkerResult {
  const isProd = process.env.NODE_ENV === "production";
  const [supported, setSupported] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const sw = swContainer();
    if (!sw) return;
    if (!isProd) {
      // Development: make sure no old portal worker keeps serving cached chunks.
      void sw
        .getRegistrations()
        .then((regs) => regs.filter((r) => r.active?.scriptURL.includes(SW_URL)).forEach((r) => void r.unregister()))
        .catch(() => undefined);
      return;
    }
    setSupported(true);
    let cancelled = false;
    let reg: ServiceWorkerRegistration | null = null;

    const watch = (r: ServiceWorkerRegistration) => {
      if (r.waiting && sw.controller) setUpdateReady(true);
      r.addEventListener("updatefound", () => {
        const installing = r.installing;
        installing?.addEventListener("statechange", () => {
          // "installed" with an existing controller = an update waiting; without = first install.
          if (installing.state === "installed" && sw.controller && !cancelled) setUpdateReady(true);
        });
      });
    };

    const register = () => {
      sw.register(`${SW_URL}?v=${encodeURIComponent(swBuildVersion())}`, { scope: SW_SCOPE, updateViaCache: "none" })
        .then((r) => {
          if (cancelled) return;
          reg = r;
          setRegistration(r);
          watch(r);
        })
        .catch(() => undefined); // unsupported/blocked: the portal still works online
    };

    // Wait for load + idle so registration never delays first paint.
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const schedule = () => (w.requestIdleCallback ? w.requestIdleCallback(register, { timeout: 5_000 }) : setTimeout(register, 1_000));
    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    // Check for a new deploy when the rep comes back to the tab.
    const onVisible = () => {
      if (document.visibilityState === "visible") void reg?.update().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("load", schedule);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isProd]);

  const applyUpdate = useCallback(() => {
    const sw = swContainer();
    const waiting = registration?.waiting;
    if (!sw || !waiting) return;
    sw.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
  }, [registration]);

  const clearCaches = useCallback(() => {
    const target = registration?.active ?? swContainer()?.controller ?? null;
    target?.postMessage({ type: "CLEAR_CACHES" });
  }, [registration]);

  return { supported, registered: registration !== null, updateReady, applyUpdate, clearCaches };
}
