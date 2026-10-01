import { performance } from "perf_hooks";
import { COACH_CARDS } from "../../../../lib/consultant/coach/cards";
import {
  inferStage,
  matchCards,
  normaliseUtterance,
  precompileDeck,
} from "../../../../lib/consultant/coach/matcher";
import type { CoachCard, TranscriptSegment } from "../../../../lib/consultant/types";

const card = (over: Partial<CoachCard> & Pick<CoachCard, "id" | "triggers">): CoachCard => ({
  kind: "objection",
  stage: "qualifying",
  severity: "stall",
  title: over.id,
  listen: "",
  ask: [],
  reframe: "",
  confirm: "",
  theory: "",
  priority: 5,
  ...over,
});

const seg = (seq: number, speaker: "consultant" | "prospect", text: string): TranscriptSegment => ({
  seq,
  speaker,
  text,
  at: new Date(0).toISOString(),
});

describe("normaliseUtterance", () => {
  it.each([
    ["We CAN'T afford it!!", "we cannot afford it"],
    ["we can not afford it", "we cannot afford it"],
    ["What’s this regarding?", "what is this regarding"],
    ["She's with a patient", "she is with a patient"],
    ["The clinic's phones", "the clinic phones"],
    ["We're  fine,   thanks.", "we are fine thanks"],
    ["I'm not sure — I'll think about it", "i am not sure i will think about it"],
    ["We won't be needing it", "we will not be needing it"],
    ["We don't need it", "we do not need it"],
    ["gonna wanna", "going to want to"],
  ])("%s → %s", (input, expected) => {
    expect(normaliseUtterance(input)).toBe(expected);
  });
});

describe("matchCards", () => {
  const deck = [
    card({ id: "price", triggers: ["too expensive", "can't afford", "budget"], priority: 8, severity: "high_risk" }),
    card({ id: "think", triggers: ["think about it", "let me think"], priority: 6, severity: "stall" }),
    card({ id: "send", triggers: ["send me an email", "send me info"], priority: 5, severity: "stall" }),
    card({ id: "stage", kind: "stage", triggers: ["how does it work"], priority: 9, severity: "guide" }),
  ];

  it("matches contractions both ways (can't ↔ cannot)", () => {
    expect(matchCards("Honestly we cannot afford that right now", deck)[0]).toMatchObject({ cardId: "price", matched: "cannot afford" });
    expect(matchCards("we can't afford it", deck)[0].cardId).toBe("price");
  });

  it("is word-boundary exact (no partial words)", () => {
    expect(matchCards("the budgeting tool", deck)).toEqual([]);
    expect(matchCards("what's our budget", deck)[0].cardId).toBe("price");
  });

  it("ignores negated triggers but keeps negative triggers", () => {
    expect(matchCards("it's not too expensive actually", deck)).toEqual([]);
    const neg = [card({ id: "ni", triggers: ["not interested"] })];
    expect(matchCards("we're not interested", neg)[0].cardId).toBe("ni");
  });

  it("earlier + longer triggers score higher; severity sorts before score", () => {
    const [a] = matchCards("too expensive", deck);
    const [b] = matchCards("budget", deck);
    expect(a.score).toBeGreaterThan(b.score);
    // "how does it work" is a priority-9 guide card, but high_risk price wins the ordering.
    const both = matchCards("how does it work, it sounds too expensive", deck);
    expect(both.map((m) => m.cardId)).toEqual(["price", "stage"]);
    expect(both[1].score).toBeGreaterThan(both[0].score);
  });

  it("returns one match per card with the matched phrase, and honours exclude", () => {
    const res = matchCards("let me think about it", deck);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ cardId: "think", matched: "think about it" });
    expect(matchCards("let me think about it", deck, { exclude: new Set(["think"]) })).toEqual([]);
  });

  it("memoises compilation by array identity", () => {
    expect(precompileDeck(deck)).toBe(precompileDeck(deck));
    expect(precompileDeck([...deck])).not.toBe(precompileDeck(deck));
  });

  it("real deck: compiles and matches fast (offline deck budget <50ms, match <1ms)", () => {
    const fresh = [...COACH_CARDS]; // new identity → forces a cold compile
    const t0 = performance.now();
    precompileDeck(fresh);
    const compileMs = performance.now() - t0;

    const utterances = [
      "Eish, that's expensive for a small clinic like ours",
      "We're not interested thanks, we've got a receptionist",
      "Can you just send me an email with the info",
      "Hmm, let me think about it and chat to the doctor",
      "The weather in Cape Town has been lovely this week honestly",
    ];
    for (const u of utterances) matchCards(u, fresh); // warm JIT
    const N = 200;
    const t1 = performance.now();
    for (let i = 0; i < N; i++) matchCards(utterances[i % utterances.length], fresh);
    const matchMs = (performance.now() - t1) / N;

    console.log(`[matcher perf] cards=${COACH_CARDS.length} compile=${compileMs.toFixed(3)}ms match=${matchMs.toFixed(4)}ms/utterance`);
    (globalThis as { qaLogExpectedActual?: (p: { expected: unknown; actual: unknown; notes?: string }) => void }).qaLogExpectedActual?.({
      expected: { compileMsMax: 50, matchMsMax: 1 },
      actual: { compileMs: +compileMs.toFixed(3), matchMs: +matchMs.toFixed(4) },
      notes: "Coach Alex deck compile + per-utterance match time",
    });
    expect(compileMs).toBeLessThan(50);
    expect(matchMs).toBeLessThan(1);
    expect(matchCards("that's too expensive for us", fresh).length).toBeGreaterThan(0);
  });
});

describe("inferStage", () => {
  it("starts in connection and floors to situation after a few segments", () => {
    expect(inferStage([])).toBe("connection");
    expect(inferStage([seg(1, "consultant", "Hi, is that Sarah?"), seg(2, "prospect", "Yes speaking")])).toBe("connection");
    const chit = Array.from({ length: 6 }, (_, i) => seg(i + 1, i % 2 ? "prospect" : "consultant", "fine thanks and you"));
    expect(inferStage(chit)).toBe("situation");
  });

  it("advances on consultant question patterns and never regresses", () => {
    const s: TranscriptSegment[] = [
      seg(1, "consultant", "How are you currently handling calls after hours?"),
      seg(2, "prospect", "Voicemail mostly"),
    ];
    expect(inferStage(s)).toBe("situation");
    s.push(seg(3, "consultant", "What happens when the phones get busy and you miss calls?"));
    expect(inferStage(s)).toBe("problem_awareness");
    s.push(seg(4, "consultant", "And if nothing changes, what does that cost you over a year?"));
    expect(inferStage(s)).toBe("consequence");
    s.push(seg(5, "consultant", "How long has that been going on?")); // a problem-stage question
    expect(inferStage(s)).toBe("consequence");
    s.push(seg(6, "consultant", "Would you be open to a quick demo on Thursday?"));
    expect(inferStage(s)).toBe("commitment");
  });

  it("jumps to commitment on a prospect buying signal", () => {
    expect(inferStage([seg(1, "prospect", "OK, send me the proposal")])).toBe("commitment");
  });

  it("ignores stage patterns spoken by the prospect", () => {
    expect(inferStage([seg(1, "prospect", "what happens if nothing changes, I don't know")])).toBe("connection");
  });
});
