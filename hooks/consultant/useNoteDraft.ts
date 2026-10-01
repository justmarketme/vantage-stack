"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, pruneDrafts, readDraft, writeDraft } from "../../lib/consultant/client/drafts";

/**
 * A note draft that survives signal loss, reloads and iOS killing the tab.
 *
 *   const { draft, setDraft, clear } = useNoteDraft(`lead:${leadId}`);
 *
 * - `key: null` disables persistence (plain state).
 * - SSR-safe: starts "" and restores from localStorage after mount
 *   (`restored` flips true once that happened).
 * - Writes are debounced (400ms) and flushed immediately on tab hide /
 *   `pagehide` / unmount, so nothing typed is lost.
 * - `clear()` after the note is saved (or queued in the outbox).
 */

export interface UseNoteDraftResult {
  draft: string;
  setDraft: (value: string | ((prev: string) => string)) => void;
  clear: () => void;
  /** Additive: when the draft was last written locally (epoch ms). */
  savedAt: number | null;
  /** Additive: true once the stored draft (if any) has been loaded. */
  restored: boolean;
}

const DEBOUNCE_MS = 400;
let pruned = false;

export function useNoteDraft(key: string | null): UseNoteDraftResult {
  const [draft, setDraftState] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const latest = useRef("");
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  const persistNow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const k = keyRef.current;
    if (!k || !dirty.current) return;
    dirty.current = false;
    setSavedAt(writeDraft(k, latest.current));
  }, []);

  // Restore on key change (and flush the previous key's pending write first).
  useEffect(() => {
    if (!pruned) {
      pruned = true;
      pruneDrafts();
    }
    setRestored(false);
    if (!key) {
      latest.current = "";
      setDraftState("");
      setSavedAt(null);
      setRestored(true);
      return;
    }
    const hit = readDraft(key);
    latest.current = hit?.value ?? "";
    setDraftState(latest.current);
    setSavedAt(hit?.savedAt ?? null);
    setRestored(true);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (dirty.current) {
        dirty.current = false;
        writeDraft(key, latest.current);
      }
    };
  }, [key]);

  // Flush on hide / pagehide.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") persistNow();
    };
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [persistNow]);

  const setDraft = useCallback(
    (value: string | ((prev: string) => string)) => {
      const next = typeof value === "function" ? value(latest.current) : value;
      latest.current = next;
      setDraftState(next);
      if (!keyRef.current) return;
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(persistNow, DEBOUNCE_MS);
    },
    [persistNow],
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    dirty.current = false;
    latest.current = "";
    setDraftState("");
    setSavedAt(null);
    if (keyRef.current) clearDraft(keyRef.current);
  }, []);

  return { draft, setDraft, clear, savedAt, restored };
}
