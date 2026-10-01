"use client";

import { useEffect, useState } from "react";

/**
 * Keep the screen on while `active` (e.g. during a live call).
 *
 * Uses the Screen Wake Lock API; the browser drops the lock whenever the tab is
 * hidden, so it is re-acquired on `visibilitychange` → visible. A no-op where
 * unsupported (older iOS Safari < 16.4, Firefox < 126) or when the request is
 * refused (low battery, no user activation) — never throws.
 */

export interface UseWakeLockResult {
  supported: boolean;
  /** True while a lock is actually held. */
  locked: boolean;
}

type Sentinel = { released: boolean; release(): Promise<void>; addEventListener(t: "release", cb: () => void): void };
type WakeLockApi = { request(type: "screen"): Promise<Sentinel> };

export function useWakeLock(active: boolean): UseWakeLockResult {
  const [supported, setSupported] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const wl = (typeof navigator !== "undefined" ? (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock : undefined) ?? null;
    setSupported(!!wl);
    if (!wl || !active) return;

    let sentinel: Sentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      try {
        const s = await wl.request("screen");
        if (cancelled) {
          void s.release().catch(() => undefined);
          return;
        }
        sentinel = s;
        setLocked(true);
        s.addEventListener("release", () => {
          if (!cancelled) setLocked(false);
        });
      } catch {
        setLocked(false);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
      sentinel = null;
      setLocked(false);
    };
  }, [active]);

  return { supported, locked };
}
