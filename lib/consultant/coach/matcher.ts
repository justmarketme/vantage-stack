/**
 * Coach Alex matcher — pure, synchronous, allocation-light.
 *
 * `matchCards(text, cards)` finds which cards a PROSPECT utterance triggers.
 * `inferStage(segments)` guesses where the conversation is in NEPQ.
 *
 * Performance: the deck is compiled once per `cards` array identity (WeakMap)
 * into normalised, space-padded phrases, so matching an utterance is a handful
 * of `String#indexOf` calls — well under 1ms for the full library. Call
 * `precompileDeck(cards)` on idle (see useCardDeckWarmup) to pay the one-off
 * compile before the first call starts.
 *
 * Scoring (per card, best trigger wins):
 *   score = priority × positionWeight × lengthWeight
 *   positionWeight = 1 − 0.5·(i / n)       first-listed trigger = 1.0, last → ~0.5
 *   lengthWeight   = min(1.5, 1 + 0.1·(words − 1))   longer phrases are more specific
 * Sorted by severity (high_risk > stall > guide), then score, then priority,
 * then deck order. A trigger preceded within two words by "not"/"never" is
 * ignored ("it's not too expensive") unless the trigger itself is negative.
 */

import type { CardMatch, CardSeverity, CoachCard, NepqStage, TranscriptSegment } from "../types";
import { NEPQ_STAGES } from "../types";

// ── Normalisation ───────────────────────────────────────────────────────────

/** Pronouns / wh-words where "'s" means "is". Everywhere else "'s" is possessive and dropped. */
const S_IS = new Set([
  "it", "that", "what", "who", "where", "there", "here", "he", "she", "how", "when", "why", "this", "everything", "nothing", "something",
]);

const IRREGULAR: [RegExp, string][] = [
  [/\bcan't\b/g, "cannot"],
  [/\bcan not\b/g, "cannot"],
  [/\bwon't\b/g, "will not"],
  [/\bshan't\b/g, "shall not"],
  [/\bain't\b/g, "is not"],
  [/\blet's\b/g, "let us"],
  [/\by'all\b/g, "you all"],
  [/\bgonna\b/g, "going to"],
  [/\bwanna\b/g, "want to"],
  [/\bgotta\b/g, "got to"],
  [/\bdunno\b/g, "do not know"],
  [/\b(cuz|cos)\b/g, "because"],
];

/**
 * Lower-case, unify apostrophes, expand contractions, strip punctuation,
 * collapse whitespace. Output contains only [a-z0-9 ] with single spaces.
 */
export function normaliseUtterance(input: string): string {
  let s = String(input ?? "")
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'");
  for (const [re, rep] of IRREGULAR) s = s.replace(re, rep);
  s = s
    .replace(/n't\b/g, " not")
    .replace(/'re\b/g, " are")
    .replace(/'ve\b/g, " have")
    .replace(/'ll\b/g, " will")
    .replace(/'m\b/g, " am")
    .replace(/'d\b/g, " would")
    .replace(/\b([a-z]+)'s\b/g, (_, w: string) => (S_IS.has(w) ? `${w} is` : w));
  return s
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Deck compilation ────────────────────────────────────────────────────────

const NEGATORS = new Set(["not", "never"]);
const SEVERITY_RANK: Record<CardSeverity, number> = { high_risk: 3, stall: 2, guide: 1 };

export function severityRank(sev: CardSeverity | undefined): number {
  return sev ? SEVERITY_RANK[sev] ?? 1 : 1;
}

type CompiledTrigger = {
  /** " phrase " — space-padded for exact word-boundary indexOf. */
  padded: string;
  phrase: string;
  weight: number;
  negativeTrigger: boolean;
};

type CompiledCard = {
  card: CoachCard;
  order: number;
  rank: number;
  triggers: CompiledTrigger[];
};

export type CompiledDeck = { cards: CompiledCard[]; byId: Map<string, CoachCard> };

const compiled = new WeakMap<readonly CoachCard[], CompiledDeck>();

function compileDeck(cards: readonly CoachCard[]): CompiledDeck {
  const out: CompiledCard[] = [];
  const byId = new Map<string, CoachCard>();
  cards.forEach((card, order) => {
    byId.set(card.id, card);
    const n = Math.max(1, card.triggers.length);
    const seen = new Set<string>();
    const triggers: CompiledTrigger[] = [];
    card.triggers.forEach((raw, i) => {
      const phrase = normaliseUtterance(raw);
      if (!phrase || seen.has(phrase)) return;
      seen.add(phrase);
      const words = phrase.split(" ").length;
      const position = 1 - 0.5 * (i / n);
      const length = Math.min(1.5, 1 + 0.1 * (words - 1));
      triggers.push({
        padded: ` ${phrase} `,
        phrase,
        weight: position * length,
        negativeTrigger: phrase.split(" ").some((w) => NEGATORS.has(w)),
      });
    });
    out.push({ card, order, rank: severityRank(card.severity), triggers });
  });
  return { cards: out, byId };
}

/** Compile (once per array identity) and return the deck. Cheap to call repeatedly. */
export function precompileDeck(cards: readonly CoachCard[]): CompiledDeck {
  let deck = compiled.get(cards);
  if (!deck) {
    deck = compileDeck(cards);
    compiled.set(cards, deck);
  }
  return deck;
}

/** True when a negator sits within the two words before `index` in padded text. */
function negatedAt(padded: string, index: number): boolean {
  // `index` points at the leading space of " phrase ".
  const before = padded.slice(Math.max(0, index - 24), index).trim().split(" ");
  const a = before[before.length - 1];
  const b = before[before.length - 2];
  return NEGATORS.has(a) || NEGATORS.has(b);
}

// ── Matching ────────────────────────────────────────────────────────────────

export type RankedMatch = CardMatch & { severity: CardSeverity; priority: number };

/**
 * Cards triggered by `text`, strongest first. Each card appears at most once,
 * with the trigger phrase (normalised) that matched it.
 */
export function matchCards(
  text: string,
  cards: CoachCard[],
  opts: { exclude?: Set<string> } = {},
): CardMatch[] {
  return rankMatches(normaliseUtterance(text), precompileDeck(cards), opts.exclude).map(({ cardId, score, matched }) => ({
    cardId,
    score,
    matched,
  }));
}

/** Same as matchCards but on already-normalised text and with severity info. */
export function rankMatches(normalised: string, deck: CompiledDeck, exclude?: Set<string>): RankedMatch[] {
  if (!normalised) return [];
  const padded = ` ${normalised} `;
  const hits: (RankedMatch & { order: number; rank: number })[] = [];
  for (const c of deck.cards) {
    if (exclude?.has(c.card.id)) continue;
    let best: CompiledTrigger | null = null;
    for (const t of c.triggers) {
      if (best && t.weight <= best.weight) continue;
      let idx = padded.indexOf(t.padded);
      while (idx !== -1 && !t.negativeTrigger && negatedAt(padded, idx)) {
        idx = padded.indexOf(t.padded, idx + 1);
      }
      if (idx !== -1) best = t;
    }
    if (!best) continue;
    hits.push({
      cardId: c.card.id,
      score: Math.round(c.card.priority * best.weight * 1000) / 1000,
      matched: best.phrase,
      severity: c.card.severity ?? "guide",
      priority: c.card.priority,
      order: c.order,
      rank: c.rank,
    });
  }
  hits.sort((x, y) => y.rank - x.rank || y.score - x.score || y.priority - x.priority || x.order - y.order);
  return hits.map((h) => ({ cardId: h.cardId, score: h.score, matched: h.matched, severity: h.severity, priority: h.priority }));
}

// ── NEPQ stage inference ────────────────────────────────────────────────────

/**
 * Heuristic, monotonic stage tracker.
 *
 * 1. Each CONSULTANT segment is tested against question patterns typical of a
 *    NEPQ stage (e.g. "what happens if nothing changes" → consequence). The
 *    furthest stage reached so far wins — NEPQ moves forward, and a tracker
 *    that never regresses doesn't jitter on screen.
 * 2. A few PROSPECT buying signals ("send me the proposal", "let us book")
 *    jump straight to commitment.
 * 3. Elapsed floor: with no pattern hits, the call is in `connection` for the
 *    first 4 segments and `situation` after that (pleasantries are over).
 */
const STAGE_PATTERNS: Record<Exclude<NepqStage, "connection">, RegExp> = {
  situation:
    /\b(how (are|do) you (currently|handle|manage|book|deal|get)|walk me through|at the moment|currently|how many (calls|bookings|enquiries|inquiries|patients|clients|leads|messages)|who (handles|answers|looks after|manages)|what (system|software|process) (are you|do you))\b/,
  problem_awareness:
    /\b(what (is|are) not working|what do you (like|not like|dislike)|frustrat\w*|challeng\w*|what happens when|miss(ed|ing)? (calls|enquiries|messages|bookings)|struggl\w*|what (is|would be) the (biggest|main) (problem|issue)|why is that|how long has that)\b/,
  solution_awareness:
    /\b(if you could (wave|change|fix)|what would (that|it) (look like|mean|do)|ideal(ly)?|what would (change|be different)|if that (were|was) (solved|fixed|sorted)|how would (that|it) (help|change))\b/,
  consequence:
    /\b(what happens if (nothing|you do not|you did not|it does not)|if nothing changes|cost(ing)? you|what does that cost|how much (revenue|money) (are|is|do)|impact on|what if you (do not|did not)|a year from now)\b/,
  qualifying:
    /\b(how important is|why now|why is (this|that) important|budget|who else (is|would be|needs to be) involved|decision maker|make the decision|on a scale of|how committed)\b/,
  transition:
    /\b(based on what you (have )?(told|said|shared)|from what you (have )?(told|said|shared)|would it be helpful if|the reason i ask|what we do is|let me (show|explain) how)\b/,
  commitment:
    /\b(does (that|this|it) sound (fair|good|reasonable)|would you be open to|book (a|the|in a) (demo|time|call|slot|session)|what does your (diary|calendar)|which (day|time) (works|suits)|next step|shall we (book|set|lock)|send (you )?(the|a) (invite|proposal))\b/,
};

const PROSPECT_COMMIT =
  /\b(send (me )?(the|a) proposal|let us book|book (it|me in|a demo)|when can (we|you) start|sign me up|how do we get started|sounds good let us)\b/;

const STAGE_INDEX = new Map<NepqStage, number>(NEPQ_STAGES.map((s, i) => [s, i]));

export const ELAPSED_SITUATION_FLOOR = 4;

export function inferStage(segments: TranscriptSegment[]): NepqStage {
  let best = 0;
  const top = NEPQ_STAGES.length - 1;
  for (const seg of segments) {
    if (best === top) break;
    const t = normaliseUtterance(seg.text);
    if (!t) continue;
    if (seg.speaker === "prospect") {
      if (PROSPECT_COMMIT.test(t)) best = top;
      continue;
    }
    // Test from the most advanced stage down; first hit is the furthest stage in this line.
    for (let i = top; i > best; i--) {
      const stage = NEPQ_STAGES[i] as Exclude<NepqStage, "connection">;
      if (STAGE_PATTERNS[stage].test(t)) {
        best = i;
        break;
      }
    }
  }
  if (best === 0 && segments.length > ELAPSED_SITUATION_FLOOR) best = STAGE_INDEX.get("situation")!;
  return NEPQ_STAGES[best];
}
