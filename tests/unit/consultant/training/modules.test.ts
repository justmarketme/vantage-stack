import { TRAINING_MODULES } from "../../../../lib/consultant/training/modules";

describe("Training module definitions", () => {
  test("there are exactly six modules", () => {
    expect(TRAINING_MODULES).toHaveLength(6);
  });

  test("orders run 1–6 in sequence with no gaps", () => {
    expect(TRAINING_MODULES.map((m) => m.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("ids are unique, non-empty, url-safe slugs", () => {
    const ids = TRAINING_MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  test("every clip is an 8-second micro-lesson", () => {
    expect(TRAINING_MODULES.every((m) => m.durationSec === 8)).toBe(true);
  });

  test("titles and summaries are present", () => {
    for (const m of TRAINING_MODULES) {
      expect(m.title.trim().length).toBeGreaterThan(0);
      expect(m.summary.trim().length).toBeGreaterThan(0);
    }
  });

  test("video paths are null until clips are supplied (or a non-empty path)", () => {
    for (const m of TRAINING_MODULES) {
      expect(m.videoPath === null || (typeof m.videoPath === "string" && m.videoPath.length > 0)).toBe(true);
    }
  });
});
