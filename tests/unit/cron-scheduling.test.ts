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

  test("rejects unsupported cron expressions", () => {
    const fn = () => nextRunUtcFromCron("*/5 2 * * *", new Date());
    log({ throws: true }, { throws: true });
    expect(fn).toThrow();
  });
});

