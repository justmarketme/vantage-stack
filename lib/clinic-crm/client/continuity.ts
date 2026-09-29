"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { api, LOGOUT_EVENT, UNAUTHORIZED_EVENT } from "./api";
import { STORAGE_PREFIX, getStorage, safeGet, safeRemove, safeSet } from "./storage";

/**
 * Cross-device continuity: small UI state (drafts, filters, open panels, theme)
 * that follows a staff member from the front-desk PC to their phone.
 *
 *   const [draft, setDraft, { synced }] = useContinuity("draft:inbox", "");
 *
 * - Restores instantly from a sessionStorage mirror, then loads `api.state.get`.
 * - Writes are debounced (800 ms) to `api.state.put`, flushed with `keepalive`
 *   on `visibilitychange` → hidden and `pagehide`, retried on `online`.
 * - Conflicts resolve last-write-wins by the writer's timestamp. On regaining
 *   focus the server copy is re-read, so a draft typed on another device appears.
 * - Server value shape: `{ v: <value>, t: <epoch ms> }`.
 * - Mirrors are cleared on logout / 401 (drafts may contain patient details).
 */

export const CONTINUITY_CONFIG = {
  debounceMs: 800,
  mirrorPrefix: `${STORAGE_PREFIX}cont:`,
} as const;

export interface Envelope<T> {
  v: T;
  t: number;
}

/** Accepts a stored envelope; anything else (legacy/raw/garbage) is treated as absent. */
export function parseEnvelope<T>(x: unknown): Envelope<T> | null {
  if (!x || typeof x !== "object") return null;
  const e = x as Partial<Envelope<T>>;
  if (typeof e.t !== "number" || !Number.isFinite(e.t) || !("v" in e)) return null;
  return { v: e.v as T, t: e.t };
}

/**
 * Last-write-wins. Ties go to `local` (it is what the user is looking at, and
 * avoids a pointless re-render). `winner: "none"` when neither side has data.
 */
export function resolveLatest<T>(
  local: Envelope<T> | null,
  remote: Envelope<T> | null,
): { winner: "local" | "remote" | "none"; value: Envelope<T> | null } {
  if (!local && !remote) return { winner: "none", value: null };
  if (!remote) return { winner: "local", value: local };
  if (!local) return { winner: "remote", value: remote };
  return remote.t > local.t ? { winner: "remote", value: remote } : { winner: "local", value: local };
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

function readMirror<T>(key: string): Envelope<T> | null {
  const raw = safeGet(getStorage("session"), CONTINUITY_CONFIG.mirrorPrefix + key);
  if (!raw) return null;
  try {
    return parseEnvelope<T>(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeMirror<T>(key: string, env: Envelope<T>): void {
  let raw: string;
  try {
    raw = JSON.stringify(env);
  } catch {
    return;
  }
  safeSet(getStorage("session"), CONTINUITY_CONFIG.mirrorPrefix + key, raw);
}

export interface ContinuityOptions {
  /** false = local mirror only, no server calls (e.g. before sign-in). Default true. */
  enabled?: boolean;
  debounceMs?: number;
}

export type ContinuitySetter<T> = (next: T | ((prev: T) => T)) => void;

export function useContinuity<T>(
  key: string,
  initial: T,
  opts: ContinuityOptions = {},
): [T, ContinuitySetter<T>, { synced: boolean }] {
  const enabled = opts.enabled !== false;
  const debounceMs = opts.debounceMs ?? CONTINUITY_CONFIG.debounceMs;

  const [value, setValueState] = useState<T>(initial);
  const [synced, setSynced] = useState(false);

  const current = useRef<Envelope<T> | null>(null);
  /** Envelope written locally but not yet acknowledged by the server. */
  const pending = useRef<Envelope<T> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const apply = useCallback((env: Envelope<T>) => {
    current.current = env;
    setValueState(env.v);
  }, []);

  const push = useCallback(
    async (keepalive = false) => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const env = pending.current;
      if (!env || !enabledRef.current) return;
      try {
        await api.state.put(key, env, { keepalive });
        if (pending.current === env) {
          pending.current = null;
          setSynced(true);
        }
      } catch {
        setSynced(false); // stays pending; retried on next change / online / hide
      }
    },
    [key],
  );

  const pull = useCallback(async () => {
    if (!enabledRef.current) return;
    try {
      const remote = parseEnvelope<T>(await api.state.get(key));
      const r = resolveLatest(pending.current ?? current.current, remote);
      if (r.winner === "remote" && r.value) {
        pending.current = null;
        apply(r.value);
        writeMirror(key, r.value);
        setSynced(true);
      } else if (r.winner === "local" && r.value) {
        if (!remote || r.value.t > remote.t) {
          pending.current = r.value;
          void push();
        } else {
          setSynced(true);
        }
      } else {
        setSynced(true);
      }
    } catch {
      setSynced(false);
    }
  }, [key, apply, push]);

  // Instant restore from this tab's mirror (before paint, no flash).
  useIsoLayoutEffect(() => {
    pending.current = null;
    current.current = null;
    const m = readMirror<T>(key);
    if (m) apply(m);
    else setValueState(initial);
    setSynced(false);
    return () => {
      // Unmount / key change: don't lose the last keystrokes of the old slot.
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const last = pending.current;
      pending.current = null;
      if (last && enabledRef.current) api.state.put(key, last, { keepalive: true }).catch(() => undefined);
    };
    // `initial` deliberately excluded: only the key identifies the slot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, apply]);

  useEffect(() => {
    if (!enabled) return;
    void pull();
    const onHide = () => void push(true);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") onHide();
      else if (!pending.current) void pull();
    };
    const onOnline = () => void (pending.current ? push() : pull());
    const onWipe = () => {
      pending.current = null;
      safeRemove(getStorage("session"), CONTINUITY_CONFIG.mirrorPrefix + key);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("online", onOnline);
    window.addEventListener(LOGOUT_EVENT, onWipe);
    window.addEventListener(UNAUTHORIZED_EVENT, onWipe);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(LOGOUT_EVENT, onWipe);
      window.removeEventListener(UNAUTHORIZED_EVENT, onWipe);
    };
  }, [enabled, key, pull, push]);

  const setValue = useCallback<ContinuitySetter<T>>(
    (next) => {
      const prev = current.current ? current.current.v : value;
      const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      // Strictly increasing even if the clock hasn't ticked, so LWW sees our own writes in order.
      const t = Math.max(Date.now(), (current.current?.t ?? 0) + 1);
      const env: Envelope<T> = { v, t };
      apply(env);
      writeMirror(key, env);
      if (!enabledRef.current) return;
      pending.current = env;
      setSynced(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void push(), debounceMs);
    },
    [key, value, apply, push, debounceMs],
  );

  return [value, setValue, { synced }];
}
