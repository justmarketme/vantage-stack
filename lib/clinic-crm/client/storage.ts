/**
 * Defensive Web Storage access.
 *
 * Safari private mode, disabled cookies, sandboxed iframes and full quotas all
 * make `localStorage` / `sessionStorage` throw — on property access, not just on
 * write. Every storage touch in the Clinic CRM client goes through here so a
 * storage failure degrades to "no persistence" instead of breaking the app.
 */

/** Every key this client writes starts with this prefix; logout clears it wholesale. */
export const STORAGE_PREFIX = "vsc:v1:";
/** Theme preference lives outside the prefix on purpose: it is not PII and survives logout. */
export const THEME_STORAGE_KEY = "vsc-theme";

export type StorageKind = "local" | "session";

export function getStorage(kind: StorageKind): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = kind === "local" ? window.localStorage : window.sessionStorage;
    return s ?? null;
  } catch {
    return null;
  }
}

export function safeGet(storage: Storage | null, key: string): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

/** Returns false when the write was refused (quota, private mode). */
export function safeSet(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeRemove(storage: Storage | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function safeKeys(storage: Storage | null): string[] {
  if (!storage) return [];
  try {
    const out: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k !== null) out.push(k);
    }
    return out;
  } catch {
    return [];
  }
}

export function removeByPrefix(storage: Storage | null, prefix: string): void {
  for (const k of safeKeys(storage)) if (k.startsWith(prefix)) safeRemove(storage, k);
}

/**
 * POPIA: wipe everything this client persisted (query cache + continuity
 * mirrors) from both storages. Called on logout and on any 401.
 */
export function clearPersistedClientState(): void {
  removeByPrefix(getStorage("local"), STORAGE_PREFIX);
  removeByPrefix(getStorage("session"), STORAGE_PREFIX);
}
