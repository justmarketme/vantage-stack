import { nextRunUtcFromCron } from "../../lib/scheduler-engine/cron";

function log(expected: unknown, actual: unknown) {
  globalThis.qaLogExpectedActual?.({ expected, actual });
}

describe("Cron job scheduling", () => {
  test("computes next run for daily schedule", () => {
    const from = new Date("2026-03-18T01:59:00.000Z");
    const next = nextRunUtcFromCron("0 2 * * *", from);
    log({ nextIso: "2026-03-18T02:00:00.000Z" }, { nextIso: next?.toISOString() ?? null });
    expect(next?.toISOString()).toBe("2026-03-18T02:00:00.000Z");
  });

  test("computes next run for step schedule (*/5)", () => {
    // Step syntax is supported: every 5 minutes. From 02:01 → next match is 02:05.
    const from = new Date("2026-03-18T02:01:00.000Z");
    const next = nextRunUtcFromCron("*/5 2 * * *", from);
    log({ nextIso: "2026-03-18T02:05:00.000Z" }, { nextIso: next?.toISOString() ?? null });
    expect(next?.toISOString()).toBe("2026-03-18T02:05:00.000Z");
  });

  test("rejects genuinely unsupported cron expressions", () => {
    log({ throws: true }, { throws: true });
    expect(() => nextRunUtcFromCron("0 2 * *")).toThrow(); // wrong field count (4)
    expect(() => nextRunUtcFromCron("99 2 * * *")).toThrow(); // minute out of range
    expect(() => nextRunUtcFromCron("abc 2 * * *")).toThrow(); // non-numeric field
  });
});

