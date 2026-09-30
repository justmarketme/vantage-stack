import { COACH_CARDS } from "../../../../lib/consultant/coach/cards";
import { CARD_SEVERITIES, NEPQ_STAGES } from "../../../../lib/consultant/types";

describe("Coach Alex card library", () => {
  test("card ids are unique and non-empty", () => {
    const ids = COACH_CARDS.map((c) => c.id);
    expect(ids.every((id) => id.length > 0 && id.length <= 80)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every NEPQ stage has exactly one stage card", () => {
    for (const stage of NEPQ_STAGES) {
      const stageCards = COACH_CARDS.filter((c) => c.kind === "stage" && c.stage === stage);
      expect({ stage, count: stageCards.length }).toEqual({ stage, count: 1 });
    }
  });

  test("every card references a valid NEPQ stage", () => {
    const valid = new Set<string>(NEPQ_STAGES);
    expect(COACH_CARDS.filter((c) => !valid.has(c.stage)).map((c) => c.id)).toEqual([]);
  });

  test("has at least 14 objection cards", () => {
    expect(COACH_CARDS.filter((c) => c.kind === "objection").length).toBeGreaterThanOrEqual(14);
  });

  test("triggers are non-empty, trimmed and lower-case", () => {
    for (const c of COACH_CARDS) {
      expect({ id: c.id, hasTriggers: c.triggers.length > 0 }).toEqual({ id: c.id, hasTriggers: true });
      for (const t of c.triggers) {
        expect({ id: c.id, t, ok: t.trim() === t && t.length > 0 && t === t.toLowerCase() }).toEqual({
          id: c.id,
          t,
          ok: true,
        });
      }
      // No duplicate triggers within a card.
      expect(new Set(c.triggers).size).toBe(c.triggers.length);
    }
  });

  test("priorities are integers 1–10", () => {
    for (const c of COACH_CARDS) {
      expect(Number.isInteger(c.priority) && c.priority >= 1 && c.priority <= 10).toBe(true);
    }
  });

  test("every card has the full Listen → Ask → Reframe → Confirm framework", () => {
    for (const c of COACH_CARDS) {
      expect(c.title.trim().length).toBeGreaterThan(0);
      expect(c.listen.trim().length).toBeGreaterThan(0);
      expect(c.ask.length).toBeGreaterThan(0);
      expect(c.ask.every((a) => a.trim().length > 0)).toBe(true);
      expect(c.reframe.trim().length).toBeGreaterThan(0);
      expect(c.confirm.trim().length).toBeGreaterThan(0);
    }
  });

  test("severity: stage cards are guides, objections are high_risk or stall", () => {
    for (const c of COACH_CARDS) {
      expect(CARD_SEVERITIES).toContain(c.severity);
      if (c.kind === "stage") expect({ id: c.id, severity: c.severity }).toEqual({ id: c.id, severity: "guide" });
      else expect(["high_risk", "stall"]).toContain(c.severity);
    }
  });

  test("every card explains its NEPQ theory in 2–4 sentences", () => {
    for (const c of COACH_CARDS) {
      const sentences = c.theory.split(/(?<=[.!?])\s+/).filter((x) => x.trim().length > 0);
      expect({ id: c.id, ok: sentences.length >= 2 && sentences.length <= 4 }).toEqual({ id: c.id, ok: true });
    }
  });

  test("objections outrank stage cards so an objection always wins a tie", () => {
    const minObjection = Math.min(...COACH_CARDS.filter((c) => c.kind === "objection").map((c) => c.priority));
    const maxStage = Math.max(...COACH_CARDS.filter((c) => c.kind === "stage").map((c) => c.priority));
    expect(minObjection).toBeGreaterThan(maxStage);
  });
});
