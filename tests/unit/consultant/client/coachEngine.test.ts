import { CoachEngine } from "../../../../lib/consultant/client/coachEngine";
import type { CoachCard, TranscriptSegment } from "../../../../lib/consultant/types";

const card = (id: string, triggers: string[], severity: CoachCard["severity"], priority = 5): CoachCard => ({
  id,
  kind: "objection",
  stage: "qualifying",
  severity,
  title: id,
  triggers,
  listen: "",
  ask: [],
  reframe: "",
  confirm: "",
  theory: "",
  priority,
});

const DECK: CoachCard[] = [
  card("price", ["too expensive"], "high_risk", 9),
  card("ni", ["not interested"], "high_risk", 9),
  card("think", ["think about it"], "stall", 6),
  card("email", ["send me an email"], "stall", 5),
  card("later", ["call me later"], "stall", 4),
  card("busy", ["we are busy"], "stall", 3),
  card("how", ["how does it work"], "guide", 7),
];

let seq = 0;
const p = (text: string): TranscriptSegment => ({ seq: ++seq, speaker: "prospect", text, at: "" });
const c = (text: string): TranscriptSegment => ({ seq: ++seq, speaker: "consultant", text, at: "" });

describe("CoachEngine", () => {
  beforeEach(() => {
    seq = 0;
  });

  it("only matches NEW prospect segments", () => {
    const e = new CoachEngine(DECK);
    const segs = [c("is it too expensive?"), p("hello")];
    expect(e.ingest(segs, 0)).toBe(false);
    expect(e.active).toBeNull();
    segs.push(p("hmm that's too expensive"));
    expect(e.ingest(segs, 10)).toBe(true);
    expect(e.active?.card.id).toBe("price");
    expect(e.active?.heard).toBe("too expensive");
    expect(e.ingest(segs, 20)).toBe(false); // same list again: nothing new
  });

  it("queues a new card while the active one is within the 4s read-hold, then promotes via tick", () => {
    const e = new CoachEngine(DECK);
    e.ingest([p("I need to think about it")], 0);
    e.ingest([p("can you send me an email")], 1000);
    expect(e.active?.card.id).toBe("think");
    expect(e.queue.map((q) => q.card.id)).toEqual(["email"]);
    expect(e.nextTickAt()).toBe(4000);
    expect(e.tick(3999)).toBe(false);
    expect(e.tick(4000)).toBe(true);
    expect(e.active?.card.id).toBe("email");
    expect(e.queue.map((q) => q.card.id)).toEqual(["think"]);
  });

  it("newest wins after the hold lapses", () => {
    const e = new CoachEngine(DECK);
    e.ingest([p("think about it")], 0);
    e.ingest([p("send me an email")], 5000);
    expect(e.active?.card.id).toBe("email");
  });

  it("high_risk may interrupt the hold; stall/guide may not; nothing but high_risk displaces high_risk", () => {
    const e = new CoachEngine(DECK);
    e.ingest([p("think about it")], 0);
    e.ingest([p("honestly that's too expensive")], 500);
    expect(e.active?.card.id).toBe("price");
    expect(e.critical).toBe(true);
    e.ingest([p("how does it work")], 10_000); // guide, after hold
    expect(e.active?.card.id).toBe("price");
    expect(e.queue[0].card.id).toBe("think"); // stall ranks above guide in the queue
    e.ingest([p("we're not interested")], 10_500); // high_risk replaces high_risk after hold
    expect(e.active?.card.id).toBe("ni");
  });

  it("queue is capped at 3, ordered by severity then score", () => {
    const e = new CoachEngine(DECK);
    e.ingest([p("too expensive")], 0);
    e.ingest([p("we are busy")], 100);
    e.ingest([p("call me later")], 200);
    e.ingest([p("send me an email")], 300);
    e.ingest([p("think about it")], 400);
    expect(e.queue.map((q) => q.card.id)).toEqual(["think", "email", "later"]);
  });

  it("used/dismissed cards never return; cooldown blocks re-showing within 90s", () => {
    const e = new CoachEngine(DECK);
    e.ingest([p("think about it")], 0);
    expect(e.markUsed("think", 1000)).toBe(true);
    e.ingest([p("let me think about it")], 200_000);
    expect(e.active).toBeNull();

    const f = new CoachEngine(DECK);
    f.ingest([p("send me an email")], 0);
    f.ingest([p("think about it")], 5000); // replaces email; email goes to queue
    f.dismiss("email", 6000); // removed from queue
    f.markUsed("think", 7000);
    seq = 100;
    f.ingest([p("send me an email")], 8000);
    expect(f.active).toBeNull(); // dismissed → retired

    const g = new CoachEngine(DECK, { cooldownMs: 90_000 });
    g.ingest([p("call me later")], 0);
    g.ingest([p("send me an email")], 5000); // later → queue
    g.dismiss("email", 5100); // later promoted & re-shown at 5100
    expect(g.active?.card.id).toBe("later");
  });

  it("promotes the queue head when the active card is used", () => {
    const e = new CoachEngine(DECK);
    e.ingest([p("think about it")], 0);
    e.ingest([p("send me an email")], 1000);
    e.markUsed("think", 2000);
    expect(e.active?.card.id).toBe("email");
    expect(e.active?.shownAt).toBe(2000);
  });

  it("buffers shown/used/dismissed events with the trigger phrase, drains and requeues", () => {
    const e = new CoachEngine(DECK);
    e.ingest([p("Hmm, honestly that's TOO expensive for us")], 0);
    e.dismiss("price", 1000);
    const events = e.drainEvents();
    expect(events).toEqual([
      { cardId: "price", action: "shown", at: new Date(0).toISOString(), triggerText: "too expensive" },
      { cardId: "price", action: "dismissed", at: new Date(1000).toISOString(), triggerText: "too expensive" },
    ]);
    expect(e.pendingEvents).toBe(0);
    e.requeueEvents(events);
    expect(e.pendingEvents).toBe(2);
    expect(e.history.map((h) => h.action)).toEqual(["shown", "dismissed"]);
  });
});
