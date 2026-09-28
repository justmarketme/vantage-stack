import { rateLimit, rateLimitDetailed } from "../../../../lib/clinic-crm/auth/rateLimit";

describe("clinic-crm rateLimit", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(rateLimit(key, 5, 60_000)).toBe(true);
    expect(rateLimit(key, 5, 60_000)).toBe(false);
  });

  it("keys are independent", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    expect(rateLimit(a, 1, 60_000)).toBe(true);
    expect(rateLimit(a, 1, 60_000)).toBe(false);
    expect(rateLimit(b, 1, 60_000)).toBe(true);
  });

  it("resets after the window", () => {
    const key = `w-${Math.random()}`;
    const now = Date.now();
    const spy = jest.spyOn(Date, "now").mockReturnValue(now);
    expect(rateLimit(key, 1, 1_000)).toBe(true);
    expect(rateLimit(key, 1, 1_000)).toBe(false);
    spy.mockReturnValue(now + 1_001);
    expect(rateLimit(key, 1, 1_000)).toBe(true);
  });

  it("reports Retry-After seconds when blocked", () => {
    const key = `r-${Math.random()}`;
    rateLimitDetailed(key, 1, 30_000);
    const r = rateLimitDetailed(key, 1, 30_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfter).toBeGreaterThan(0);
    expect(r.retryAfter).toBeLessThanOrEqual(30);
  });
});
