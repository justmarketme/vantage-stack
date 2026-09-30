/**
 * Coach Alex card queue — the pure state machine behind `useCoachCards`.
 *
 * Rules:
 * - Only NEW prospect segments are matched (seq > last processed).
 * - Per utterance, the strongest match (severity, then score) is offered.
 * - A card is not re-shown within `cooldownMs` of being shown, and never again
 *   once used or dismissed on this call.
 * - One active card + a queue of at most `maxQueue`, ordered by severity then
 *   score. The newest offer replaces the active card, EXCEPT within
 *   `minReadMs` of the active card appearing (the consultant is reading it) —
 *   then it queues. A `high_risk` card may interrupt that hold; stall/guide may
 *   not, and nothing interrupts an active `high_risk` card except a newer one.
 *   `tick(now)` promotes a newer queued offer once the hold lapses.
 * - Every show / use / dismiss is buffered as a CardEventInput event.
 */

import { precompileDeck, rankMatches, normaliseUtterance, severityRank } from "../coach/matcher";
import type { CardEventInput, CardSeverity, CoachCard, TranscriptSegment } from "../types";

export type CardEvent = CardEventInput["events"][number];

export type ActiveCard = { card: CoachCard; heard: string; score: number; shownAt: number; offeredAt: number };
export type QueuedCard = { card: CoachCard; heard: string; score: number; offeredAt: number };
export type CardHistoryEntry = {
  cardId: string;
  title: string;
  action: "shown" | "used" | "dismissed";
  heard: string;
  at: number;
};

export type CoachEngineOptions = {
  cooldownMs?: number;
  minReadMs?: number;
  maxQueue?: number;
};

export const COACH_DEFAULTS = { cooldownMs: 90_000, minReadMs: 4_000, maxQueue: 3 } as const;

const rank = (sev: CardSeverity | undefined) => severityRank(sev);

function compareOffer(a: { card: CoachCard; score: number; offeredAt: number }, b: typeof a): number {
  return rank(b.card.severity) - rank(a.card.severity) || b.score - a.score || b.offeredAt - a.offeredAt;
}

export class CoachEngine {
  active: ActiveCard | null = null;
  queue: QueuedCard[] = [];
  history: CardHistoryEntry[] = [];
  private events: CardEvent[] = [];
  private lastShown = new Map<string, number>();
  private retired = new Set<string>();
  private processedSeq = 0;
  private readonly opts: Required<CoachEngineOptions>;

  constructor(
    private readonly cards: CoachCard[],
    opts: CoachEngineOptions = {},
  ) {
    this.opts = { ...COACH_DEFAULTS, ...opts };
    precompileDeck(cards);
  }

  get lastSeq(): number {
    return this.processedSeq;
  }

  /** Feed the full (or incremental) segment list; returns true if visible state changed. */
  ingest(segments: readonly TranscriptSegment[], now: number): boolean {
    let changed = false;
    const deck = precompileDeck(this.cards);
    for (const seg of segments) {
      if (seg.seq <= this.processedSeq) continue;
      this.processedSeq = seg.seq;
      if (seg.speaker !== "prospect") continue;
      const exclude = this.blocked(now);
      const [top] = rankMatches(normaliseUtterance(seg.text), deck, exclude);
      if (!top) continue;
      const card = deck.byId.get(top.cardId);
      if (!card) continue;
      changed = this.offer({ card, heard: top.matched, score: top.score, offeredAt: now }, now) || changed;
    }
    return changed;
  }

  /** Promote a newer queued offer once the read-hold has lapsed. */
  tick(now: number): boolean {
    const a = this.active;
    if (!a || this.queue.length === 0) return false;
    if (now - a.shownAt < this.opts.minReadMs) return false;
    const idx = this.queue.findIndex((q) => q.offeredAt > a.shownAt && this.mayReplace(a, q.card));
    if (idx === -1) return false;
    const [next] = this.queue.splice(idx, 1);
    this.enqueue({ card: a.card, heard: a.heard, score: a.score, offeredAt: a.offeredAt });
    this.show(next, now);
    return true;
  }

  /** When the next `tick` could change something (ms epoch), or null. */
  nextTickAt(): number | null {
    if (!this.active || this.queue.length === 0) return null;
    return this.active.shownAt + this.opts.minReadMs;
  }

  markUsed(cardId: string, now: number): boolean {
    return this.retire(cardId, "used", now);
  }

  dismiss(cardId: string, now: number): boolean {
    return this.retire(cardId, "dismissed", now);
  }

  get critical(): boolean {
    return this.active?.card.severity === "high_risk";
  }

  /** Remove and return buffered events (max `max`). */
  drainEvents(max = 100): CardEvent[] {
    return this.events.splice(0, max);
  }

  /** Put events back at the front after a failed send (bounded to 300). */
  requeueEvents(events: CardEvent[]): void {
    this.events = [...events, ...this.events].slice(0, 300);
  }

  get pendingEvents(): number {
    return this.events.length;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private blocked(now: number): Set<string> {
    const s = new Set(this.retired);
    this.lastShown.forEach((t, id) => {
      if (now - t < this.opts.cooldownMs) s.add(id);
    });
    if (this.active) s.add(this.active.card.id);
    for (const q of this.queue) s.add(q.card.id);
    return s;
  }

  /** May `incoming` replace `active` right now (ignoring the read-hold)? */
  private mayReplace(active: ActiveCard, incoming: CoachCard): boolean {
    // An active high_risk card only yields to another high_risk card.
    return !(active.card.severity === "high_risk" && incoming.severity !== "high_risk");
  }

  private offer(o: QueuedCard, now: number): boolean {
    const a = this.active;
    if (!a) {
      this.show(o, now);
      return true;
    }
    const withinHold = now - a.shownAt < this.opts.minReadMs;
    const canInterruptHold = o.card.severity === "high_risk" && a.card.severity !== "high_risk";
    if (this.mayReplace(a, o.card) && (!withinHold || canInterruptHold)) {
      this.enqueue({ card: a.card, heard: a.heard, score: a.score, offeredAt: a.offeredAt });
      this.show(o, now);
      return true;
    }
    this.enqueue(o);
    return true;
  }

  private enqueue(o: QueuedCard): void {
    this.queue = [...this.queue.filter((q) => q.card.id !== o.card.id), o].sort(compareOffer).slice(0, this.opts.maxQueue);
  }

  private show(o: QueuedCard, now: number): void {
    this.active = { ...o, shownAt: now };
    this.lastShown.set(o.card.id, now);
    this.log(o.card, "shown", o.heard, now);
  }

  private retire(cardId: string, action: "used" | "dismissed", now: number): boolean {
    if (this.active?.card.id === cardId) {
      const a = this.active;
      this.retired.add(cardId);
      this.log(a.card, action, a.heard, now);
      this.active = null;
      this.promote(now);
      return true;
    }
    const i = this.queue.findIndex((q) => q.card.id === cardId);
    if (i !== -1) {
      const [q] = this.queue.splice(i, 1);
      this.queue = [...this.queue];
      this.retired.add(cardId);
      this.log(q.card, action, q.heard, now);
      return true;
    }
    return false;
  }

  private promote(now: number): void {
    while (this.queue.length) {
      const [next, ...rest] = this.queue;
      this.queue = rest;
      if (this.retired.has(next.card.id)) continue;
      this.show(next, now);
      return;
    }
  }

  private log(card: CoachCard, action: CardHistoryEntry["action"], heard: string, now: number): void {
    this.history = [...this.history, { cardId: card.id, title: card.title, action, heard, at: now }];
    this.events.push({
      cardId: card.id.slice(0, 80),
      action,
      at: new Date(now).toISOString(),
      // The matched trigger phrase from the card library — never raw transcript text.
      triggerText: heard ? heard.slice(0, 500) : undefined,
    });
  }
}
