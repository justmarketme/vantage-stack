import { STORAGE_PREFIX, safeGet, safeKeys, safeRemove, safeSet } from "./storage";

/**
 * Persistent layer of the query cache (pure — no React). The hook layer in
 * `query.ts` keeps an in-memory map and uses this to survive reloads.
 *
 * POPIA rules enforced HERE, not left to callers:
 * 1. Nothing is persisted until a clinic scope is set (after `auth.me`), so two
 *    clinics sharing a browser never see each other's cache.
 * 2. Keys in `NEVER_PERSIST_PREFIXES` are memory-only regardless of `persist`.
 *    UI keys to use (and that are therefore never written to disk):
 *      "conversations", "conversation:<patientId>", "messages:*",
 *      "patient:<id>" (detail view), "patient-export:<id>".
 * 3. Before anything is written, clinical free text is blanked: every `notes`
 *    field, and `body` / `lastMessage` on any object carrying a `patientId`
 *    (i.e. patient messages). Memory keeps the full value; disk never does.
 * 4. Entries expire after `ttlMs`, are size-capped, and the oldest are evicted.
 */

export const CACHE_CONFIG = {
  /** Oldest cached data we will ever show (still revalidated immediately). */
  ttlMs: 12 * 60 * 60 * 1000,
  /** Data younger than this is not refetched on mount (dedupes rapid remounts). */
  freshMs: 15_000,
  maxEntryBytes: 96 * 1024,
  maxTotalBytes: 768 * 1024,
  maxEntries: 60,
} as const;

export const NEVER_PERSIST_PREFIXES = [
  "conversations",
  "conversation:",
  "messages",
  "patient:",
  "patient-export:",
] as const;

export function isPersistableKey(key: string): boolean {
  return !NEVER_PERSIST_PREFIXES.some((p) => key === p || key.startsWith(p));
}

/** Deep copy with clinical free text blanked (see rule 3). Never mutates input. */
export function redactForStorage(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactForStorage);
  if (value === null || typeof value !== "object") return value;
  const src = value as Record<string, unknown>;
  const patientScoped = "patientId" in src;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    if (k === "notes" && typeof v === "string") out[k] = "";
    else if (patientScoped && (k === "body" || k === "lastMessage") && typeof v === "string") out[k] = "";
    else out[k] = redactForStorage(v);
  }
  return out;
}

export interface CacheEntry<T = unknown> {
  v: T;
  /** Epoch ms when the value was fetched. */
  t: number;
}

export interface PersistentCacheOptions {
  ttlMs?: number;
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  maxEntries?: number;
  now?: () => number;
}

export function cachePrefix(scope: string): string {
  return `${STORAGE_PREFIX}${scope}:q:`;
}

export class PersistentCache {
  private readonly storage: Storage | null;
  private scope: string | null = null;
  private readonly o: Required<PersistentCacheOptions>;

  constructor(storage: Storage | null, opts: PersistentCacheOptions = {}) {
    this.storage = storage;
    this.o = {
      ttlMs: opts.ttlMs ?? CACHE_CONFIG.ttlMs,
      maxEntryBytes: opts.maxEntryBytes ?? CACHE_CONFIG.maxEntryBytes,
      maxTotalBytes: opts.maxTotalBytes ?? CACHE_CONFIG.maxTotalBytes,
      maxEntries: opts.maxEntries ?? CACHE_CONFIG.maxEntries,
      now: opts.now ?? Date.now,
    };
  }

  /** Clinic id from the session; `null` disables persistence. */
  setScope(scope: string | null): void {
    this.scope = scope && /^[A-Za-z0-9_-]{1,64}$/.test(scope) ? scope : null;
  }

  getScope(): string | null {
    return this.scope;
  }

  /** Storage key for a query key, or null when persistence is off for it. */
  storageKey(key: string): string | null {
    if (!this.scope || !isPersistableKey(key)) return null;
    return cachePrefix(this.scope) + key;
  }

  /** Query key for a storage key in the current scope (used by the `storage` event). */
  queryKeyOf(storageKey: string): string | null {
    if (!this.scope) return null;
    const p = cachePrefix(this.scope);
    return storageKey.startsWith(p) ? storageKey.slice(p.length) : null;
  }

  read<T>(key: string): CacheEntry<T> | null {
    const sk = this.storageKey(key);
    if (!sk) return null;
    const entry = this.parse<T>(safeGet(this.storage, sk));
    if (!entry) return null;
    if (this.o.now() - entry.t > this.o.ttlMs) {
      safeRemove(this.storage, sk);
      return null;
    }
    return entry;
  }

  parse<T>(raw: string | null): CacheEntry<T> | null {
    if (!raw) return null;
    try {
      const e = JSON.parse(raw) as CacheEntry<T>;
      return e && typeof e === "object" && typeof e.t === "number" && "v" in e ? e : null;
    } catch {
      return null;
    }
  }

  /** Returns true if written. Never throws. */
  write<T>(key: string, value: T, t = this.o.now()): boolean {
    const sk = this.storageKey(key);
    if (!sk) return false;
    let raw: string;
    try {
      raw = JSON.stringify({ v: redactForStorage(value), t } satisfies CacheEntry);
    } catch {
      return false; // circular / non-serialisable
    }
    if (raw.length > this.o.maxEntryBytes) {
      safeRemove(this.storage, sk);
      return false;
    }
    safeRemove(this.storage, sk);
    this.evict(raw.length);
    if (safeSet(this.storage, sk, raw)) return true;
    // Quota exceeded: drop half of our entries and try once more.
    this.evict(raw.length, true);
    return safeSet(this.storage, sk, raw);
  }

  remove(key: string): void {
    const sk = this.storageKey(key);
    if (sk) safeRemove(this.storage, sk);
  }

  removePrefix(prefix: string): void {
    if (!this.scope) return;
    const p = cachePrefix(this.scope) + prefix;
    for (const k of safeKeys(this.storage)) if (k.startsWith(p)) safeRemove(this.storage, k);
  }

  /** Removes every cache entry for every scope (logout / 401). */
  clearAll(): void {
    for (const k of safeKeys(this.storage)) {
      if (k.startsWith(STORAGE_PREFIX) && k.includes(":q:")) safeRemove(this.storage, k);
    }
  }

  /** Evict oldest entries (all scopes) until `incoming` more bytes fit the caps. */
  private evict(incoming: number, aggressive = false): void {
    const entries: { k: string; t: number; size: number }[] = [];
    for (const k of safeKeys(this.storage)) {
      if (!k.startsWith(STORAGE_PREFIX) || !k.includes(":q:")) continue;
      const raw = safeGet(this.storage, k);
      const e = this.parse(raw);
      if (!raw || !e || this.o.now() - e.t > this.o.ttlMs) {
        safeRemove(this.storage, k);
        continue;
      }
      entries.push({ k, t: e.t, size: raw.length });
    }
    entries.sort((a, b) => a.t - b.t);
    let total = entries.reduce((s, e) => s + e.size, 0);
    let count = entries.length;
    const dropUntil = aggressive ? Math.floor(count / 2) : 0;
    let dropped = 0;
    for (const e of entries) {
      const over = total + incoming > this.o.maxTotalBytes || count + 1 > this.o.maxEntries;
      if (!over && dropped >= dropUntil) break;
      safeRemove(this.storage, e.k);
      total -= e.size;
      count -= 1;
      dropped += 1;
    }
  }
}
