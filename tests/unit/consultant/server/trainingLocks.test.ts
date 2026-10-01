import { withLocks } from "../../../../lib/consultant/server/repo/training";

const mods = [3, 1, 2].map((order) => ({
  id: `m${order}`,
  order,
  title: `Module ${order}`,
  summary: "",
  videoPath: null,
  durationSec: 8 as const,
}));

describe("training sequential unlock", () => {
  test("only the first module is open at the start", () => {
    const list = withLocks(mods, new Map());
    expect(list.map((m) => [m.id, m.locked])).toEqual([
      ["m1", false],
      ["m2", true],
      ["m3", true],
    ]);
  });
  test("completing n unlocks n+1 only", () => {
    const list = withLocks(mods, new Map([["m1", "2026-10-01T08:00:00.000Z"]]));
    expect(list.map((m) => m.locked)).toEqual([false, false, true]);
    expect(list[0].completedAt).toBe("2026-10-01T08:00:00.000Z");
  });
  test("a completion out of order doesn't unlock past a gap", () => {
    const list = withLocks(mods, new Map([["m2", "2026-10-01T08:00:00.000Z"]]));
    expect(list.map((m) => m.locked)).toEqual([false, true, true]);
  });
});
