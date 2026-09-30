import { MAX_TRACKED_KEYS, rateLimit, resetRateLimits, trackedKeyCount } from "../../../../lib/consultant/auth/rateLimit";

describe("rateLimit (fixed window, in-memory)", () => {
  beforeEach(() => resetRateLimits());

  it("allows `limit` hits per window then blocks", () => {
    const t = 1_000_000;
    expect([1, 2, 3].map(() => rateLimit("k", 3, 60_000, t))).toEqual([true, true, true]);
    expect(rateLimit("k", 3, 60_000, t + 1)).toBe(false);
  });

  it("resets after the window", () => {
    const t = 1_000_000;
    rateLimit("k", 1, 1000, t);
    expect(rateLimit("k", 1, 1000, t + 999)).toBe(false);
    expect(rateLimit("k", 1, 1000, t + 1000)).toBe(true);
  });

  it("keeps keys independent", () => {
    expect(rateLimit("a", 1, 1000, 0)).toBe(true);
    expect(rateLimit("b", 1, 1000, 0)).toBe(true);
    expect(rateLimit("a", 1, 1000, 1)).toBe(false);
  });

  it("fails closed on nonsense limits", () => {
    expect(rateLimit("z", 0, 1000)).toBe(false);
    expect(rateLimit("z", 5, 0)).toBe(false);
  });

  it("never tracks more than MAX_TRACKED_KEYS", () => {
    for (let i = 0; i < MAX_TRACKED_KEYS + 50; i++) rateLimit(`k${i}`, 1, 60_000, 0);
    expect(trackedKeyCount()).toBeLessThanOrEqual(MAX_TRACKED_KEYS);
  });
});
