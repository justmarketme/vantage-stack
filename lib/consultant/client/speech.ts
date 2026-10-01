/**
 * Spoken-input normalisation + validation (pure — no DOM, heavily unit-tested).
 *
 * Speech engines return words, not symbols: "jane dot smith at gmail dot com".
 * These functions turn dictation into the value a field expects, then
 * `validateSpoken` checks it with the SAME zod rules the API uses
 * (`LeadInput` in lib/consultant/types.ts), so a spoken value that passes here
 * passes the server.
 *
 * Tuned for South African English: "at the rate", "co dot za", "oh" for zero,
 * "double seven", "plus two seven" — and South African names (see
 * `normaliseSpokenName` + saNames.ts). Phones are SA +27 ONLY: a foreign
 * number is rejected with a clear message rather than silently accepted.
 */

import { LeadInput, normalizeE164, normalizeZaPhone } from "../types";
import { SA_HONORIFICS, SA_NAMES, SA_NAME_PARTICLES, type SaNameEntry } from "./saNames";

export type SpokenKind = "email" | "url" | "phone" | "name" | "text";
export type SpokenValidation = { ok: boolean; value: string; error?: string };

// ── Shared lexical tables ───────────────────────────────────────────────────

const UNITS: Record<string, string> = {
  zero: "0", nought: "0", nil: "0",
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
};
/** Only digits when surrounded by other digits ("oh eight two", "five oh one"). */
const SOFT_UNITS: Record<string, string> = { oh: "0", to: "2", too: "2", for: "4", ate: "8" };
const TEENS: Record<string, string> = {
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
};
const TENS: Record<string, string> = {
  twenty: "2", thirty: "3", forty: "4", fourty: "4", fifty: "5", sixty: "6", seventy: "7", eighty: "8", ninety: "9",
};
const REPEAT: Record<string, number> = { double: 2, triple: 3, treble: 3 };

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const isHardNumber = (t: string | undefined) =>
  !!t && (/^\d+$/.test(t) || own(UNITS, t) || own(TEENS, t) || own(TENS, t));

/**
 * Convert number words in a token list to digit tokens.
 * `aggressive`: every number word becomes digits (email local parts, phones).
 * Otherwise a lone number word stays a word ("the one clinic") and only runs
 * of two or more numeric tokens are converted ("twenty four seven" → 247).
 */
function numberise(tokens: string[], aggressive: boolean): string[] {
  const n = tokens.length;
  const hard = tokens.map((t) => isHardNumber(t));
  // Which tokens are numeric in context.
  const num = tokens.map((t, i) => {
    if (hard[i]) return true;
    if (own(REPEAT, t)) return hard[i + 1] === true || own(SOFT_UNITS, tokens[i + 1] ?? "");
    if (own(SOFT_UNITS, t)) {
      const prev = hard[i - 1] === true;
      const next = hard[i + 1] === true || own(REPEAT, tokens[i + 1] ?? "");
      // "oh" leads numbers ("oh eight two"); "to"/"for"/"ate" only sit between digits.
      return t === "oh" ? prev || next : prev && next;
    }
    return false;
  });
  // Soft units after a REPEAT ("double oh") are numeric too.
  for (let i = 1; i < n; i++) if (own(REPEAT, tokens[i - 1]) && own(SOFT_UNITS, tokens[i])) num[i] = true;

  const out: string[] = [];
  let i = 0;
  while (i < n) {
    if (!num[i]) {
      out.push(tokens[i++]);
      continue;
    }
    let j = i;
    while (j < n && num[j]) j++;
    const run = tokens.slice(i, j);
    const convert = aggressive || run.length >= 2 || run.every((t) => /^\d+$/.test(t));
    if (!convert) {
      out.push(...run);
      i = j;
      continue;
    }
    for (let k = 0; k < run.length; k++) {
      const t = run[k];
      const next = run[k + 1];
      if (own(REPEAT, t)) {
        const d =
          next === undefined ? null : own(UNITS, next) ? UNITS[next] : own(SOFT_UNITS, next) ? SOFT_UNITS[next] : /^\d$/.test(next) ? next : null;
        if (d !== null) {
          out.push(d.repeat(REPEAT[t]));
          k++;
        } else out.push(t);
      } else if (/^\d+$/.test(t)) out.push(t);
      else if (own(TENS, t)) {
        if (next && own(UNITS, next) && next !== "zero") {
          out.push(TENS[t] + UNITS[next]);
          k++;
        } else out.push(TENS[t] + "0");
      } else if (own(TEENS, t)) out.push(TEENS[t]);
      else if (own(UNITS, t)) out.push(UNITS[t]);
      else out.push(SOFT_UNITS[t] ?? t);
    }
    i = j;
  }
  return out;
}

/** "double l" → "l l" (letters) — digits are handled by numberise. */
function expandRepeatedLetters(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const next = tokens[i + 1];
    if (own(REPEAT, t) && next && /^[a-z]$/.test(next)) {
      for (let k = 0; k < REPEAT[t]; k++) out.push(next);
      i++;
    } else out.push(t);
  }
  return out;
}

const LEAD_IN =
  /^(?:(?:so|okay|ok|yes|yeah|right|um|uh)\s+)*(?:(?:my|our|the|his|her|their|your)\s+)?(?:e ?-?mail(?: address)?|address|website(?: address)?|web ?site|site|web address|url|link|domain|(?:cell(?:phone)?|mobile|phone|telephone|contact)?\s*number)\s+(?:is|it is|it's|would be)\s+/;

function stripLeadIn(s: string): string {
  return s.replace(LEAD_IN, "").replace(/^(?:it is|it's|that is|that's)\s+/, "");
}

/** Symbol words shared by emails and URLs. Order matters (longest first). */
const SYMBOLS_COMMON: [RegExp, string][] = [
  [/\b(?:dub(?:ya)? dub(?:ya)? dub(?:ya)?|double ?u double ?u double ?u|triple w|w w w)\b/g, " www "],
  [/\bfull stop\b/g, " . "],
  [/\b(?:dot|period|point)\b/g, " . "],
  [/\bunder ?score\b/g, " _ "],
  [/\b(?:dash|hyphen|minus)\b/g, " - "],
  [/\b(?:capital|uppercase|upper case|lowercase|lower case|small letter|small)\b/g, " "],
];

const SYMBOLS_EMAIL: [RegExp, string][] = [
  [/\bat the rate(?: of)?\b/g, " @ "],
  [/\bat (?:sign|symbol)\b/g, " @ "],
  [/\bplus\b/g, " + "],
];

const SYMBOLS_URL: [RegExp, string][] = [
  [/\b(?:forward )?slash\b/g, " / "],
  [/\bback ?slash\b/g, " / "],
  [/\bcolon\b/g, " : "],
  [/\bquestion mark\b/g, " ? "],
  [/\b(?:equals|equal sign|equal)\b/g, " = "],
  [/\b(?:ampersand|and sign)\b/g, " & "],
  [/\b(?:hash|hashtag|pound sign)\b/g, " # "],
  [/\btilde\b/g, " ~ "],
];

function baseTokens(text: string, table: [RegExp, string][]): string[] {
  let s = stripLeadIn(
    String(text ?? "")
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .trim(),
  );
  for (const [re, rep] of SYMBOLS_COMMON) s = s.replace(re, rep);
  for (const [re, rep] of table) s = s.replace(re, rep);
  // Keep symbols we produced or the engine already typed; drop stray punctuation.
  s = s.replace(/[,;!"'()[\]{}<>]/g, " ");
  return s.split(/\s+/).filter(Boolean);
}

// ── Domains ─────────────────────────────────────────────────────────────────

const PROVIDER_TLD: Record<string, string> = {
  gmail: "gmail.com",
  googlemail: "googlemail.com",
  hotmail: "hotmail.com",
  outlook: "outlook.com",
  live: "live.com",
  icloud: "icloud.com",
  yahoo: "yahoo.com",
  mweb: "mweb.co.za",
  telkomsa: "telkomsa.net",
  vodamail: "vodamail.co.za",
  webmail: "webmail.co.za",
  iafrica: "iafrica.com",
  absamail: "absamail.co.za",
};

const PROVIDER_TYPOS: Record<string, string> = {
  gmial: "gmail", gamil: "gmail", gmal: "gmail", gmaill: "gmail", jimail: "gmail", geemail: "gmail", gemail: "gmail",
  hotmale: "hotmail", hotmial: "hotmail", hotmal: "hotmail",
  outlok: "outlook", yahooo: "yahoo", icloude: "icloud", eyecloud: "icloud",
};

/** Fix SA/common TLD run-togethers: "clinic.coza" → "clinic.co.za", "gmailcom" → "gmail.com". */
function repairDomain(domain: string): string {
  let d = domain.replace(/\.{2,}/g, ".").replace(/^[.-]+|[.-]+$/g, "");
  const labels = d.split(".");
  if (labels[0] && own(PROVIDER_TYPOS, labels[0])) labels[0] = PROVIDER_TYPOS[labels[0]];
  d = labels.join(".");
  // Provider with no TLD or a run-together "com".
  const bare = d.replace(/(?:\.?com)$/, "");
  if (!d.includes(".") || /^[a-z]+com$/.test(d)) {
    if (own(PROVIDER_TLD, d)) return PROVIDER_TLD[d];
    if (own(PROVIDER_TLD, bare)) return PROVIDER_TLD[bare];
  }
  d = d
    .replace(/\.co\.?za$/, ".co.za")
    .replace(/\.org\.?za$/, ".org.za")
    .replace(/\.ac\.?za$/, ".ac.za")
    .replace(/\.gov\.?za$/, ".gov.za")
    .replace(/\.net\.?za$/, ".net.za")
    .replace(/\.coza$/, ".co.za");
  // "glowclinicco.za" / "glowcliniccoza" (engine dropped the "dot").
  if (!/\.co\.za$/.test(d)) d = d.replace(/([a-z0-9])co\.?za$/, "$1.co.za");
  return d;
}

// ── Email ───────────────────────────────────────────────────────────────────

/**
 * "jane dot smith at gmail dot com" → "jane.smith@gmail.com".
 * Handles "at the rate", underscore, dash/hyphen, plus, spelled letters
 * ("j a n e"), "double l", spoken digits ("jane twenty three"), "co dot za",
 * and a missing ".com" on the big providers ("jane at gmail").
 */
export function normaliseSpokenEmail(text: string): string {
  let tokens = baseTokens(text, SYMBOLS_EMAIL);
  if (tokens.length === 0) return "";
  if (!tokens.some((t) => t.includes("@"))) {
    const at = tokens.lastIndexOf("at");
    if (at > 0) tokens[at] = "@";
  }
  tokens = expandRepeatedLetters(tokens);
  const atIdx = tokens.findIndex((t) => t.includes("@"));
  let local: string;
  let domain: string;
  if (atIdx === -1) {
    local = numberise(tokens, true).join("");
    domain = "";
  } else {
    const before = tokens.slice(0, atIdx);
    const joinedAt = tokens[atIdx];
    const [lPart, dPart] = joinedAt.split("@");
    local = numberise([...before, ...(lPart ? [lPart] : [])], true).join("");
    domain = numberise([...(dPart ? [dPart] : []), ...tokens.slice(atIdx + 1)], false).join("");
  }
  local = local.replace(/\.{2,}/g, ".").replace(/^[.]+|[.]+$/g, "").replace(/[^a-z0-9._%+-]/g, "");
  if (atIdx === -1) return local;
  domain = repairDomain(domain.replace(/@/g, "").replace(/[^a-z0-9.-]/g, ""));
  return `${local}@${domain}`;
}

// ── URL ─────────────────────────────────────────────────────────────────────

/**
 * "www dot glow clinic dot co dot za slash book" → "https://www.glowclinic.co.za/book".
 * Multi-word labels are joined without spaces; a scheme is added when missing.
 */
export function normaliseSpokenUrl(text: string): string {
  let tokens = baseTokens(text, SYMBOLS_URL);
  if (tokens.length === 0) return "";
  tokens = expandRepeatedLetters(tokens);
  let s = numberise(tokens, false).join("");
  s = s.replace(/[^a-z0-9:/?#[\]@!$&'()*+,;=._~%-]/g, "");
  // Scheme: "https:" / "https//" / "http" spoken without punctuation.
  let scheme = "https://";
  const m = /^(https?)(?::\/\/|:\/|:|\/\/)?/.exec(s);
  if (m && (s.length > m[1].length + 1) && /^(https?)(:|\/\/|www)/.test(s)) {
    scheme = `${m[1]}://`;
    s = s.slice(m[0].length);
  }
  s = s.replace(/^\/+/, "");
  // Split host / rest.
  const cut = s.search(/[/?#]/);
  let host = cut === -1 ? s : s.slice(0, cut);
  let rest = cut === -1 ? "" : s.slice(cut);
  host = host.replace(/^www(?!\.)(?=[a-z0-9])/, "www.");
  host = repairDomain(host);
  rest = rest.replace(/[.,]+$/, "");
  if (!host) return "";
  return `${scheme}${host}${rest}`;
}

// ── Phone ───────────────────────────────────────────────────────────────────

/**
 * Spoken or typed phone → SA E.164 when valid ("oh eight two five five five one
 * two three four" → "+27825551234"; "plus two seven double seven…"),
 * otherwise the best-effort digits so the field can show what was heard.
 * Only +27 numbers are ever converted: "+44 20…" comes back as "+4420…" (not a
 * valid SA number) and `validateSpoken("phone")` rejects it with
 * a "South African numbers only" message.
 */
export function normaliseSpokenPhone(text: string): string {
  const raw = stripLeadIn(String(text ?? "").toLowerCase().trim());
  const tokens = raw
    .replace(/\bplus\b/g, " + ")
    .replace(/[,.;:()]/g, " ")
    .replace(/(\d)-(?=\d)/g, "$1 ")
    .split(/[\s]+/)
    .filter(Boolean);
  let plus = false;
  const cleaned: string[] = [];
  for (const t of tokens) {
    if (t === "+" || (t.startsWith("+") && /^\+\d+$/.test(t) && cleaned.length === 0)) {
      if (cleaned.length === 0) plus = true;
      if (t !== "+") cleaned.push(t.slice(1));
      continue;
    }
    if (t === "-" || t === "dash" || t === "and") continue;
    cleaned.push(t === "o" || t === "owe" ? "oh" : t);
  }
  // Every soft unit counts in a phone context ("oh", "to", "for" between digits).
  const digits = numberise(cleaned, true)
    .map((t) => (own(SOFT_UNITS, t) ? SOFT_UNITS[t] : t))
    .filter((t) => /^\d+$/.test(t))
    .join("");
  if (!digits) return "";
  const candidate = (plus ? "+" : "") + digits;
  // SA habit: the trunk "0" is often dropped when reading a number aloud
  // ("eight two five five five…") — nine digits not starting with 0 is a local SA number.
  const local = !plus && /^[1-9]\d{8}$/.test(digits) ? `0${digits}` : candidate;
  return normalizeZaPhone(local) ?? candidate;
}

// ── South African names ─────────────────────────────────────────────────────

/** Compare names ignoring case, spaces, hyphens, apostrophes and accents. */
function nameKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

let nameIndex: Map<string, SaNameEntry> | null = null;
/** Lookup: canonical + misheard keys → entry. Canonical wins on a clash. */
function names(): Map<string, SaNameEntry> {
  if (!nameIndex) {
    const m = new Map<string, SaNameEntry>();
    for (const e of SA_NAMES) {
      for (const heard of e.misheard ?? []) {
        const k = nameKey(heard);
        if (k && !m.has(k)) m.set(k, e);
      }
    }
    for (const e of SA_NAMES) m.set(nameKey(e.canonical), e);
    nameIndex = m;
  }
  return nameIndex;
}

const NAME_LEAD_IN =
  /^(?:(?:so|okay|ok|yes|yeah|right|um|uh)\s+)*(?:(?:(?:my|his|her|their|the|our|your|contact(?:'s)?|owner(?:'s)?)\s+)?(?:(?:full|first|last|given|sur)\s*)?name(?:\s+is|'s)|this is|it is|it's|i am|i'm|(?:you're |you are )?speaking (?:to|with))\s+/;

/** Capitalise a single unknown name word: "o'brien" → "O'Brien", "mcdonald" → "McDonald", "smith-jones" → "Smith-Jones". */
function capitaliseWord(w: string): string {
  return w
    .split("-")
    .map((part) => {
      if (!part) return part;
      const apos = /^([a-z])'([a-z].*)$/.exec(part);
      if (apos) return `${apos[1].toUpperCase()}'${apos[2][0].toUpperCase()}${apos[2].slice(1)}`;
      const mc = /^mc([a-z])(.*)$/.exec(part);
      if (mc) return `Mc${mc[1].toUpperCase()}${mc[2]}`;
      return part[0].toUpperCase() + part.slice(1);
    })
    .join("-");
}

/**
 * Spoken name → correctly spelt and cased South African name.
 *
 *   "tandeka mokwena"             → "Thandeka Mokoena"
 *   "nkosi nathi dlamini"         → "Nkosinathi Dlamini"   (split word re-joined)
 *   "pieter vandermerwe"          → "Pieter van der Merwe"  (merged word split)
 *   "van der merwe"               → "Van der Merwe"         (surname alone: capital particle)
 *   "doctor priya naidu"          → "Dr Priya Naidoo"
 *   "my name is t h a n d e k a"  → "Thandeka"               (spelled out)
 *
 * How it works: after removing a lead-in ("my name is…") and joining spelled
 * letters, it scans left to right and, at each position, tries the longest run
 * of up to 4 words whose letters (spaces/hyphens ignored) match a name in the
 * table — canonical spelling or a known mis-hearing. Unmatched words are
 * title-cased, with surname particles (van, der, du, de, le…) kept lower-case
 * inside a name and capitalised when they start it.
 */
export function normaliseSpokenName(text: string): string {
  let s = String(text ?? "")
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .trim()
    .replace(/[.,;:!?"()[\]{}]/g, " ")
    .replace(/\s+/g, " ");
  s = s.replace(NAME_LEAD_IN, "");
  const raw = s
    .replace(/[^\p{L}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  // Join spelled-out letters: three or more single letters in a row form one word
  // ("t h a n d e k a"); one or two stay as initials ("j p").
  const tokens: string[] = [];
  for (let i = 0; i < raw.length; ) {
    let j = i;
    while (j < raw.length && /^\p{L}$/u.test(raw[j])) j++;
    if (j - i >= 3) {
      tokens.push(raw.slice(i, j).join(""));
      i = j;
    } else {
      tokens.push(raw[i]);
      i += 1;
    }
  }
  if (tokens.length === 0) return "";

  const index = names();
  type Part = { text: string; known: boolean; honorific?: boolean };
  const parts: Part[] = [];
  let i = 0;
  if (Object.prototype.hasOwnProperty.call(SA_HONORIFICS, tokens[0]) && tokens.length > 1) {
    parts.push({ text: SA_HONORIFICS[tokens[0]], known: true, honorific: true });
    i = 1;
  }
  while (i < tokens.length) {
    let matched = false;
    for (let w = Math.min(4, tokens.length - i); w >= 1; w--) {
      const hit = index.get(nameKey(tokens.slice(i, i + w).join("")));
      if (hit) {
        parts.push({ text: hit.canonical, known: true });
        i += w;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const t = tokens[i];
      // A particle only stays lower-case when another word follows it.
      const particle = SA_NAME_PARTICLES.has(t) && i < tokens.length - 1;
      parts.push({ text: particle ? t : /^\p{L}$/u.test(t) ? t.toUpperCase() : capitaliseWord(t), known: false });
      i += 1;
    }
  }

  // The first real name word always starts with a capital ("Van der Merwe",
  // "Du Toit" when the surname stands alone; "Dr Van Wyk" is also correct SA usage).
  const firstName = parts.findIndex((p) => !p.honorific);
  if (firstName >= 0) {
    const p = parts[firstName];
    p.text = p.text.charAt(0).toUpperCase() + p.text.slice(1);
  }
  return parts
    .map((p) => p.text)
    .join(" ")
    .slice(0, 120)
    .trim();
}

// ── Medical-aesthetic vocabulary ────────────────────────────────────────────

/**
 * Canonical spelling/casing for aesthetic-clinic vocabulary. `pattern` is a
 * regex source matched case-insensitively on word boundaries; `plural` lets a
 * trailing "s" through and keeps it. Order matters: specific before general.
 */
export const MEDICAL_TERMS: { canonical: string; pattern: string; plural?: boolean }[] = [
  // Neurotoxins
  { canonical: "Botox", pattern: "bo[\\s-]?tox|botocks|bow ?tox|boat ox" },
  { canonical: "Dysport", pattern: "dys[\\s-]?port|dis[\\s-]port" },
  { canonical: "Xeomin", pattern: "[xz]eo[\\s-]?min|zio[\\s-]?min" },
  { canonical: "anti-wrinkle injection", pattern: "anti[\\s-]?wrinkle injection", plural: true },
  // Fillers & biostimulators
  { canonical: "hyaluronic acid", pattern: "(?:hy|hi|high)[\\s-]?a?[\\s-]?(?:lu|lou|lo|loo)[\\s-]?(?:ronic|ronnic|ronik) acid" },
  { canonical: "hyaluronic", pattern: "(?:hy|hi|high)[\\s-]?a?[\\s-]?(?:lu|lou|lo|loo)[\\s-]?(?:ronic|ronnic|ronik)" },
  { canonical: "dermal filler", pattern: "dermal?[\\s-]?fill(?:er|a|ah)", plural: true },
  { canonical: "lip filler", pattern: "lip[\\s-]?fill(?:er|a|ah)", plural: true },
  { canonical: "Juvéderm", pattern: "juv[ée]derm|juv[eiau][\\s-]derm|juva?derm" },
  { canonical: "Restylane", pattern: "restylane|rest[iy][\\s-]?lane|rest a lane" },
  { canonical: "Profhilo", pattern: "profhilo|pro[\\s-]?(?:fi|hi|fee)[\\s-]?lo" },
  { canonical: "Sculptra", pattern: "sculptra|sculpt[\\s-]ra" },
  { canonical: "Radiesse", pattern: "radiesse|radi[ae]ss?e|rady[\\s-]?ess" },
  { canonical: "polynucleotides", pattern: "poly[\\s-]?nucleotides?" },
  { canonical: "exosomes", pattern: "exo[\\s-]?somes?" },
  { canonical: "skin booster", pattern: "skin[\\s-]?booster", plural: true },
  { canonical: "tear trough", pattern: "tear[\\s-]?tr(?:ough|off|of)", plural: true },
  { canonical: "Aqualyx", pattern: "aqualyx|aqua[\\s-]?(?:lix|licks|lyx)" },
  // Threads
  { canonical: "PDO thread", pattern: "(?:p\\.? ?d\\.? ?o\\.?|pdo) thread", plural: true },
  { canonical: "thread lift", pattern: "thread[\\s-]?lift", plural: true },
  // Skin & devices
  { canonical: "RF microneedling", pattern: "(?:r\\.? ?f\\.?|rf|radio[\\s-]?frequency) micro[\\s-]?needl(?:ing|in)" },
  { canonical: "microneedling", pattern: "micro[\\s-]?needl(?:ing|in)" },
  { canonical: "Morpheus8", pattern: "morpheus[\\s-]?(?:8|eight|ate)" },
  { canonical: "HydraFacial", pattern: "hydr[ao][\\s-]?facial", plural: true },
  { canonical: "chemical peel", pattern: "chemical pe(?:e|a)l", plural: true },
  { canonical: "dermaplaning", pattern: "derma[\\s-]?plan(?:e)?ing" },
  { canonical: "mesotherapy", pattern: "meso[\\s-]?therapy" },
  { canonical: "laser hair removal", pattern: "la[sz]er hair remov(?:al|er)" },
  { canonical: "CO2 laser", pattern: "(?:c\\.? ?o\\.? ?(?:2|two)|co2|co two) laser", plural: true },
  { canonical: "Fraxel", pattern: "frax+el|frax el" },
  { canonical: "CoolSculpting", pattern: "k?cool[\\s-]?sculpt(?:ing|in)?|kool[\\s-]?sculpting" },
  { canonical: "Emsculpt", pattern: "em[\\s-]?sculpt" },
  { canonical: "Ultherapy", pattern: "ultherapy|ul[\\s-]therapy|ulthera" },
  { canonical: "HIFU", pattern: "h\\.? ?i\\.? ?f\\.? ?u\\.?|hifu|high[\\s-]?foo" },
  { canonical: "SkinPen", pattern: "skin[\\s-]?pen" },
  { canonical: "Obagi", pattern: "obagi|o[\\s-]bagi" },
  { canonical: "tretinoin", pattern: "tret[ia]noin" },
  // Acronyms (spelled out by the engine)
  { canonical: "platelet-rich plasma", pattern: "platelet[\\s-]?rich plasma" },
  { canonical: "PRP", pattern: "p\\.? ?r\\.? ?p\\.?|prp" },
  { canonical: "PRF", pattern: "p\\.? ?r\\.? ?f\\.?|prf" },
  { canonical: "IPL", pattern: "i\\.? ?p\\.? ?l\\.?|ipl" },
  { canonical: "BBL", pattern: "b\\.? ?b\\.? ?l\\.?|bbl" },
];

let compiledTerms: { re: RegExp; canonical: string; plural: boolean }[] | null = null;
function terms() {
  if (!compiledTerms) {
    compiledTerms = MEDICAL_TERMS.map((t) => ({
      re: new RegExp(`\\b(?:${t.pattern})${t.plural ? "(s)?" : ""}\\b`, "gi"),
      canonical: t.canonical,
      plural: !!t.plural,
    }));
  }
  return compiledTerms;
}

/** Fix casing/spelling of aesthetic treatments and products inside free text. */
export function normaliseMedicalTerms(text: string): string {
  let s = String(text ?? "");
  for (const t of terms()) {
    s = s.replace(t.re, (...args: unknown[]) => {
      const plural = t.plural && typeof args[1] === "string" && args[1] ? "s" : "";
      return t.canonical + plural;
    });
  }
  return s;
}

// ── Free-text dictation ─────────────────────────────────────────────────────

const DICTATION_PUNCT: [RegExp, string][] = [
  [/\s*\bnew paragraph\b\s*/gi, "\n\n"],
  [/\s*\bnew line\b\s*/gi, "\n"],
  [/\s*\bquestion mark\b/gi, "?"],
  [/\s*\bexclamation (?:mark|point)\b/gi, "!"],
  [/\s*\bfull stop\b/gi, "."],
  [/\s*\bcomma\b/gi, ","],
];

/** Notes / free text: spoken punctuation, medical vocabulary, sentence case. */
export function normaliseDictation(text: string): string {
  let s = String(text ?? "");
  for (const [re, rep] of DICTATION_PUNCT) s = s.replace(re, rep);
  s = normaliseMedicalTerms(s)
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/ +([,.?!])/g, "$1")
    .replace(/([,.?!])(?=[A-Za-z])/g, "$1 ")
    .trim();
  s = s.replace(/^([a-z])/, (c) => c.toUpperCase());
  s = s.replace(/([.?!]\s+|\n)([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());
  return s;
}

// ── Validation ──────────────────────────────────────────────────────────────

const MESSAGES = {
  emptyEmail: "We didn't catch an email address. Try again or type it.",
  badEmail: "That doesn't sound like a valid email address. Check it, or try again spelling it out.",
  emptyUrl: "We didn't catch a website. Try again or type it.",
  badUrl: "That doesn't sound like a valid website. Try again, saying \"dot\" between the parts.",
  emptyPhone: "We didn't catch a number. Try again or type it.",
  badPhone: "That doesn't sound like a valid phone number. Say every digit, for example \"oh eight two…\".",
  foreignPhone: "Only South African numbers (+27) can be used. Say a number starting with \"oh\" or \"plus two seven\".",
  emptyName: "We didn't catch a name. Try again or type it.",
  badName: "That doesn't sound like a name. Try again, or spell it out letter by letter.",
  emptyText: "We didn't catch anything. Try again.",
} as const;

/**
 * Normalise + validate with the contract's zod rules. `value` is always the
 * best-effort normalised value (so the UI can prefill the field for editing)
 * even when `ok` is false.
 */
export function validateSpoken(kind: SpokenKind, text: string): SpokenValidation {
  switch (kind) {
    case "email": {
      const value = normaliseSpokenEmail(text);
      if (!value) return { ok: false, value, error: MESSAGES.emptyEmail };
      const r = LeadInput.shape.email.safeParse(value);
      return r.success && r.data ? { ok: true, value: r.data } : { ok: false, value, error: MESSAGES.badEmail };
    }
    case "url": {
      const value = normaliseSpokenUrl(text);
      if (!value) return { ok: false, value, error: MESSAGES.emptyUrl };
      const r = LeadInput.shape.website.safeParse(value);
      // zod's url() accepts "https://glowclinic" — require a dotted host too.
      const host = /^https?:\/\/([^/?#]+)/.exec(value)?.[1] ?? "";
      const plausible = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host);
      return r.success && r.data && plausible ? { ok: true, value: r.data } : { ok: false, value, error: MESSAGES.badUrl };
    }
    case "phone": {
      const value = normaliseSpokenPhone(text);
      if (!value) return { ok: false, value, error: MESSAGES.emptyPhone };
      const za = normalizeZaPhone(value);
      const r = za ? LeadInput.shape.phone.safeParse(za) : null;
      if (za && r?.success) return { ok: true, value: za };
      // A valid international number that isn't +27 gets its own, clearer message.
      // (An over-long local number like "0825…" + extra digit is NOT foreign — just wrong.)
      const e164 = normalizeE164(value);
      const foreign = e164 !== null && !/^\+(?:0|27)/.test(e164);
      return { ok: false, value, error: foreign ? MESSAGES.foreignPhone : MESSAGES.badPhone };
    }
    case "name": {
      const value = normaliseSpokenName(text);
      if (!value) return { ok: false, value, error: MESSAGES.emptyName };
      // Contract: contactName is ≤ 80 chars; a name needs at least two letters.
      const letters = value.replace(/[^\p{L}]/gu, "").length;
      return letters >= 2 && value.length <= 80 ? { ok: true, value } : { ok: false, value, error: MESSAGES.badName };
    }
    case "text":
    default: {
      const value = normaliseDictation(text);
      return value ? { ok: true, value } : { ok: false, value, error: MESSAGES.emptyText };
    }
  }
}

/** Normaliser used for live (interim) display while the user is still talking. */
export function normaliseForKind(kind: SpokenKind, text: string): string {
  switch (kind) {
    case "email":
      return normaliseSpokenEmail(text);
    case "url":
      return normaliseSpokenUrl(text);
    case "phone":
      return normaliseSpokenPhone(text);
    case "name":
      return normaliseSpokenName(text);
    default:
      return normaliseDictation(text);
  }
}
