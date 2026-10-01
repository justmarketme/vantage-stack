/**
 * Namespaced, crash-proof localStorage access for the Consultant Portal.
 *
 * Every read/write is wrapped: Safari private mode, a full quota, disabled
 * storage or SSR (no `window`) all degrade to "nothing stored" instead of
 * throwing into a render. Keys live under `vs:consultant:v1:` so a wipe never
 * touches another product's data on the same origin.
 *
 * Callers must never put transcripts or AI summaries here. Note bodies are
 * only stored by the draft + outbox modules, which exist precisely so a rep
 * who loses signal doesn't lose what they typed.
 */

export const STORAGE_PREFIX = "vs:consultant:v1:";

/** Minimal Storage shape so tests can inject a fake. */
export interface KVStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

let override: KVStorage | null | undefined;

/** Tests: inject an in-memory storage (pass `undefined` to restore the default). */
export function setStorageForTests(s: KVStorage | null | undefined): void {
  override = s;
}

export function getStorage(): KVStorage | null {
  if (override !== undefined) return override;
  if (typeof window === "undefined") return null;
  try {
    const s = window.localStorage;
    // Touch it: some browsers expose the object but throw on access.
    const probe = `${STORAGE_PREFIX}__probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function storageKey(key: string): string {
  return STORAGE_PREFIX + key;
}

export function readJSON<T>(key: string): T | null {
  const s = getStorage();
  if (!s) return null;
  try {
    const raw = s.getItem(storageKey(key));
    return raw == null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

/** Returns false when the write could not be made (quota, disabled, SSR). */
export function writeJSON(key: string, value: unknown): boolean {
  const s = getStorage();
  if (!s) return false;
  try {
    s.setItem(storageKey(key), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  const s = getStorage();
  if (!s) return;
  try {
    s.removeItem(storageKey(key));
  } catch {
    /* ignore */
  }
}

/** Unprefixed keys (relative to STORAGE_PREFIX) that start with `prefix`. */
export function listKeys(prefix: string): string[] {
  const s = getStorage();
  if (!s) return [];
  const out: string[] = [];
  try {
    const full = storageKey(prefix);
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(full)) out.push(k.slice(STORAGE_PREFIX.length));
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function removePrefix(prefix: string): void {
  for (const k of listKeys(prefix)) removeKey(k);
}

/** In-memory KVStorage for tests and as a no-storage fallback. */
export class MemoryStorage implements KVStorage {
  private m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  getItem(key: string): string | null {
    return this.m.has(key) ? (this.m.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.m.set(key, String(value));
  }
  removeItem(key: string): void {
    this.m.delete(key);
  }
  key(index: number): string | null {
    return Array.from(this.m.keys())[index] ?? null;
  }
  clear(): void {
    this.m.clear();
  }
}
