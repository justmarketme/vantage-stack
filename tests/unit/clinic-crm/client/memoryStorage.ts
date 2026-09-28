/** In-memory Web Storage for node-env tests; can be made to throw like Safari private mode. */
export class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  quotaBytes = Infinity;
  broken = false;
  get length() {
    if (this.broken) throw new Error("SecurityError");
    return this.m.size;
  }
  key(i: number) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  getItem(k: string) {
    if (this.broken) throw new Error("SecurityError");
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error("SecurityError");
    const used = Array.from(this.m.entries()).reduce((s, [kk, vv]) => s + (kk === k ? 0 : vv.length), 0);
    if (used + v.length > this.quotaBytes) throw new Error("QuotaExceededError");
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    if (this.broken) throw new Error("SecurityError");
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  keys() {
    return Array.from(this.m.keys());
  }
}
