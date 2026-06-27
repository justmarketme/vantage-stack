// Snap a free-form spoken answer ("real estate", "ecommerce", "I'm losing leads")
// to the EXACT form option it refers to, returning that option's value. Used by
// the voice layer so Isabel's setBlueprintField always lands on a real option —
// which also keeps dependent option lists (sub-niche keys off the exact industry
// string) working. Returns null when nothing reasonably matches (free-text fields
// then keep the raw value).
//
// Pure + dependency-light so it is unit-testable in isolation.

import type { OptionDef } from "./form-schema";

const optValue = (o: OptionDef): string => (typeof o === "string" ? o : o.value);
const optLabel = (o: OptionDef): string => (typeof o === "string" ? o : o.label);

/** lowercase, punctuation→space, collapse. "E-commerce" → "e commerce". */
const norm = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
/** norm with spaces removed. "E-commerce" → "ecommerce" (catches one-word speech). */
const tight = (s: string): string => norm(s).replace(/ /g, "");

export function matchOption(options: OptionDef[], raw: string): string | null {
  const r = norm(raw);
  if (!r) return null;
  const rt = tight(raw);

  const cand = options.map((o) => {
    const value = optValue(o);
    return { value, v: norm(value), l: norm(optLabel(o)), vt: tight(value), lt: tight(optLabel(o)) };
  });

  // 1) exact, normalised (value or label)
  let m = cand.find((c) => c.v === r || c.l === r);
  if (m) return m.value;
  // 2) exact, spaces removed — "ecommerce" vs "e commerce"
  m = cand.find((c) => c.vt === rt || c.lt === rt);
  if (m) return m.value;
  // 3) containment, normalised (option inside the answer, or vice-versa)
  m = cand.find(
    (c) => (c.l && (c.l.includes(r) || r.includes(c.l))) || (c.v && (c.v.includes(r) || r.includes(c.v))),
  );
  if (m) return m.value;
  // 4) containment, spaces removed
  m = cand.find(
    (c) => (c.lt && (c.lt.includes(rt) || rt.includes(c.lt))) || (c.vt && (c.vt.includes(rt) || rt.includes(c.vt))),
  );
  if (m) return m.value;
  // 5) most shared words (last resort)
  const rtok = new Set(r.split(" ").filter(Boolean));
  let best: string | null = null;
  let bestScore = 0;
  for (const c of cand) {
    const ctok = `${c.l} ${c.v}`.split(" ").filter(Boolean);
    const score = ctok.filter((t) => rtok.has(t)).length;
    if (score > bestScore) {
      bestScore = score;
      best = c.value;
    }
  }
  return bestScore > 0 ? best : null;
}
