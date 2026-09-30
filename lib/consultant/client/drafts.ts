/**
 * Local note drafts — survive signal loss, reloads and iOS tab eviction.
 * Stored under `vs:consultant:v1:draft:<key>` as `{ v, t }`; drafts older than
 * DRAFT_TTL_MS are pruned so stale text doesn't linger on a shared device.
 */

import { listKeys, readJSON, removeKey, writeJSON } from "./storage";

export const DRAFT_NS = "draft:";
export const DRAFT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

type Stored = { v: string; t: number };

export function readDraft(key: string, now = Date.now()): { value: string; savedAt: number } | null {
  const hit = readJSON<Stored>(DRAFT_NS + key);
  if (!hit || typeof hit.v !== "string" || typeof hit.t !== "number") return null;
  if (now - hit.t > DRAFT_TTL_MS) {
    removeKey(DRAFT_NS + key);
    return null;
  }
  return { value: hit.v, savedAt: hit.t };
}

/** Empty drafts are removed rather than stored. Returns the save time, or null. */
export function writeDraft(key: string, value: string, now = Date.now()): number | null {
  if (!value || !value.trim()) {
    removeKey(DRAFT_NS + key);
    return null;
  }
  return writeJSON(DRAFT_NS + key, { v: value, t: now } satisfies Stored) ? now : null;
}

export function clearDraft(key: string): void {
  removeKey(DRAFT_NS + key);
}

export function pruneDrafts(now = Date.now()): number {
  let n = 0;
  for (const k of listKeys(DRAFT_NS)) {
    const hit = readJSON<Stored>(k);
    if (!hit || typeof hit.t !== "number" || now - hit.t > DRAFT_TTL_MS) {
      removeKey(k);
      n++;
    }
  }
  return n;
}
