import { dealHealth } from "../../../../lib/consultant/server/health";

const P = { healthYellowDays: 3, healthRedDays: 7 };
const NOW = new Date("2026-09-30T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("dealHealth", () => {
  test("won is green and lost is red regardless of activity", () => {
    expect(dealHealth({ stage: "won", lastTouchAt: daysAgo(90), nextActionAt: null }, P, NOW)).toBe("green");
    expect(dealHealth({ stage: "lost", lastTouchAt: daysAgo(0), nextActionAt: null }, P, NOW)).toBe("red");
  });

  test("days since last touch: < yellow green, < red yellow, else red", () => {
    expect(dealHealth({ stage: "contacted", lastTouchAt: daysAgo(2.9), nextActionAt: null }, P, NOW)).toBe("green");
    expect(dealHealth({ stage: "contacted", lastTouchAt: daysAgo(3), nextActionAt: null }, P, NOW)).toBe("yellow");
    expect(dealHealth({ stage: "contacted", lastTouchAt: daysAgo(6.9), nextActionAt: null }, P, NOW)).toBe("yellow");
    expect(dealHealth({ stage: "contacted", lastTouchAt: daysAgo(7), nextActionAt: null }, P, NOW)).toBe("red");
  });

  test("a scheduled future next action keeps the deal green", () => {
    const future = new Date(NOW.getTime() + 86_400_000);
    expect(dealHealth({ stage: "proposal", lastTouchAt: daysAgo(30), nextActionAt: future }, P, NOW)).toBe("green");
  });

  test("an overdue next action is never better than yellow", () => {
    expect(dealHealth({ stage: "new", lastTouchAt: daysAgo(0), nextActionAt: daysAgo(1) }, P, NOW)).toBe("yellow");
    expect(dealHealth({ stage: "new", lastTouchAt: daysAgo(10), nextActionAt: daysAgo(1) }, P, NOW)).toBe("red");
  });

  test("no touch data at all is red; ISO strings are accepted", () => {
    expect(dealHealth({ stage: "new", lastTouchAt: null, nextActionAt: null }, P, NOW)).toBe("red");
    expect(dealHealth({ stage: "new", lastTouchAt: daysAgo(1).toISOString(), nextActionAt: null }, P, NOW)).toBe("green");
  });
});
