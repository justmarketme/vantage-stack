"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeE164 } from "../types";

/**
 * Speech-to-text for staff input (notes, search, message drafts) on the Web
 * Speech API. Chrome/Edge/Samsung ship `webkitSpeechRecognition`, Safari 14.1+
 * too; Firefox has none → `supported: false` and the UI hides the mic.
 *
 * The transcript is ALWAYS shown for confirmation — this hook never sends
 * anything. `onResult` receives normalised, validated text only.
 */

export const SPEECH_CONFIG = {
  defaultLang: "en-ZA",
  /** Recognition results below this confidence are rejected (when reported). */
  minConfidence: 0.6,
  maxLen: 1000,
  /** Stop listening after this long without any new result. */
  silenceMs: 4000,
} as const;

export const SPEECH_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings to use voice input.",
  "service-not-allowed": "Voice input isn't allowed in this browser. You can type instead.",
  "no-speech": "We didn't hear anything. Tap the mic and try again.",
  "audio-capture": "No microphone was found. Check that one is connected.",
  network: "Voice input needs an internet connection. Check your connection and try again.",
  "language-not-supported": "Voice input doesn't support this language on this device.",
  "bad-grammar": "Voice input failed. Please try again or type instead.",
  empty: "We didn't catch anything. Try again.",
  "low-confidence": "We weren't sure what you said. Please try again or type instead.",
  "too-long": "That's too long for this field.",
  unknown: "Voice input stopped unexpectedly. Please try again.",
};

/** Map a SpeechRecognition error code to a friendly message; `aborted` → null (user action). */
export function mapSpeechError(code: string): string | null {
  if (code === "aborted") return null;
  return SPEECH_ERRORS[code] ?? SPEECH_ERRORS.unknown;
}

// ── Pure transcript helpers ─────────────────────────────────────────────────

/**
 * Spoken punctuation → symbols. "period" is intentionally absent: it is a real
 * word in clinical notes; SA English dictation says "full stop".
 */
const SPOKEN_PUNCTUATION: [RegExp, string][] = [
  [/\bquestion mark\b/gi, "?"],
  [/\bexclamation (?:mark|point)\b/gi, "!"],
  [/\bfull stop\b/gi, "."],
  [/\bcomma\b/gi, ","],
  [/\bcolon\b/gi, ":"],
];

export function normalizeTranscript(text: string): string {
  let s = String(text ?? "");
  for (const [re, sym] of SPOKEN_PUNCTUATION) s = s.replace(re, sym);
  s = s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.?!:])/g, "$1") // no space before punctuation
    .replace(/([,.?!:])(?=[^\s,.?!:\d])/g, "$1 ") // one space after (not inside 3.5 or 10:30)
    .replace(/([,.?!:])\1+/g, "$1")
    .trim()
    .replace(/^[,.:]\s*/, "");
  // Capitalise the first letter and the first letter of each new sentence.
  s = s.replace(/^([^A-Za-z]*)([a-z])/, (_, pre: string, c: string) => pre + c.toUpperCase());
  s = s.replace(/([.?!]\s+)([a-z])/g, (_, pre: string, c: string) => pre + c.toUpperCase());
  return s;
}

export interface ValidateTranscriptOptions {
  maxLen?: number;
  /** Reject when the engine did not report a confidence at all. */
  requireConfidence?: boolean;
  /** 0..1 from SpeechRecognitionAlternative. Engines that don't know report 0/undefined. */
  confidence?: number;
  minConfidence?: number;
}

/** Returns a user-facing error message, or null when the transcript is acceptable. */
export function validateTranscript(text: string, opts: ValidateTranscriptOptions = {}): string | null {
  const maxLen = opts.maxLen ?? SPEECH_CONFIG.maxLen;
  const min = opts.minConfidence ?? SPEECH_CONFIG.minConfidence;
  const t = (text ?? "").trim();
  if (!t) return SPEECH_ERRORS.empty;
  const reported = typeof opts.confidence === "number" && Number.isFinite(opts.confidence) && opts.confidence > 0;
  if (reported && (opts.confidence as number) < min) return SPEECH_ERRORS["low-confidence"];
  if (!reported && opts.requireConfidence) return SPEECH_ERRORS["low-confidence"];
  if (t.length > maxLen) return SPEECH_ERRORS["too-long"];
  return null;
}

const UNITS: Record<string, string> = {
  zero: "0", oh: "0", o: "0", nought: "0", nil: "0",
  one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9",
  to: "2", too: "2", for: "4", ate: "8",
};
const TENS: Record<string, string> = {
  twenty: "2", thirty: "3", forty: "4", fifty: "5", sixty: "6", seventy: "7", eighty: "8", ninety: "9",
};
const TEENS: Record<string, string> = {
  ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19",
};
const REPEAT: Record<string, number> = { double: 2, triple: 3 };
/** Homophones only count as digits between other digits ("oh eight to five…"). */
const AMBIGUOUS = new Set(["to", "too", "for", "ate"]);

const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function isDigitish(tok: string | undefined): boolean {
  return !!tok && (/^\+?\d+$/.test(tok) || (has(UNITS, tok) && !AMBIGUOUS.has(tok)) || has(TENS, tok) || has(TEENS, tok) || has(REPEAT, tok));
}

/**
 * Spoken or typed phone number → E.164 candidate (via `normalizeE164`), or null.
 * Handles digits ("082 555 1234"), words ("oh eight two…"), "double five",
 * tens ("eighty two"), and a leading "plus".
 */
export function extractPhone(text: string): string | null {
  const tokens = String(text ?? "")
    .toLowerCase()
    .replace(/[,.;:()]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);

  const out: string[] = [];
  let plus = false;
  let repeat = 1;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const next = tokens[i + 1];
    if (tok === "plus" || tok === "+") {
      if (out.length === 0) plus = true;
      continue;
    }
    if (has(REPEAT, tok)) {
      repeat = REPEAT[tok];
      continue;
    }
    let digits: string | null = null;
    if (/^\+?\d+$/.test(tok)) {
      if (tok.startsWith("+") && out.length === 0) plus = true;
      digits = tok.replace("+", "");
    } else if (has(TENS, tok)) {
      if (next !== undefined && has(UNITS, next) && !AMBIGUOUS.has(next)) {
        digits = TENS[tok] + UNITS[next];
        i++;
      } else digits = TENS[tok] + "0";
    } else if (has(TEENS, tok)) {
      digits = TEENS[tok];
    } else if (has(UNITS, tok)) {
      if (AMBIGUOUS.has(tok) && (out.length === 0 || !isDigitish(next))) digits = null;
      else digits = UNITS[tok];
    }
    if (digits !== null) {
      out.push(repeat > 1 && digits.length === 1 ? digits.repeat(repeat) : digits);
    }
    repeat = 1;
  }
  const joined = out.join("");
  if (joined.length < 9) return null;
  return normalizeE164((plus ? "+" : "") + joined);
}

// ── Hook ────────────────────────────────────────────────────────────────────

/* Minimal structural types — lib.dom does not ship SpeechRecognition everywhere. */
interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  readonly isFinal: boolean;
  readonly length: number;
  [i: number]: SRAlternative;
}
interface SREvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [i: number]: SRResult };
}
interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SRInstance;

export function getSpeechRecognition(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface SpeechInputOptions {
  onResult: (text: string) => void;
  /** Extra field-specific check; return an error message or null. */
  validate?: (text: string) => string | null;
  lang?: string;
  maxLen?: number;
  silenceMs?: number;
}

export interface SpeechInput {
  supported: boolean;
  listening: boolean;
  start: () => void;
  stop: () => void;
  /** Live partial transcript while listening. */
  interim: string;
  error: string | null;
}

export function useSpeechInput(opts: SpeechInputOptions): SpeechInput {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Detect after mount so SSR and first client render agree.
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rec = useRef<SRInstance | null>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finals = useRef<{ text: string; confidence: number }[]>([]);
  const failed = useRef(false);

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null);
    return () => {
      if (silence.current) clearTimeout(silence.current);
      try {
        rec.current?.abort();
      } catch {
        /* ignore */
      }
      rec.current = null;
    };
  }, []);

  const stop = useCallback(() => {
    if (silence.current) clearTimeout(silence.current);
    try {
      rec.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const armSilence = useCallback(() => {
    if (silence.current) clearTimeout(silence.current);
    silence.current = setTimeout(stop, optsRef.current.silenceMs ?? SPEECH_CONFIG.silenceMs);
  }, [stop]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError("Voice input isn't available in this browser. You can type instead.");
      return;
    }
    if (rec.current) return; // already listening
    let r: SRInstance;
    try {
      r = new Ctor();
    } catch {
      setError(SPEECH_ERRORS.unknown);
      return;
    }
    r.lang = optsRef.current.lang ?? SPEECH_CONFIG.defaultLang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    finals.current = [];
    failed.current = false;

    r.onresult = (e) => {
      armSilence();
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alt = res[0];
        if (!alt) continue;
        if (res.isFinal) finals.current.push({ text: alt.transcript, confidence: alt.confidence });
        else partial += alt.transcript;
      }
      const soFar = finals.current.map((f) => f.text).join(" ");
      setInterim(normalizeTranscript(`${soFar} ${partial}`));
    };
    r.onerror = (e) => {
      const msg = mapSpeechError(e.error);
      if (msg) {
        failed.current = true;
        setError(msg);
      }
    };
    r.onend = () => {
      if (silence.current) clearTimeout(silence.current);
      rec.current = null;
      setListening(false);
      setInterim("");
      if (failed.current) return;
      const o = optsRef.current;
      const text = normalizeTranscript(finals.current.map((f) => f.text).join(" "));
      const reported = finals.current.map((f) => f.confidence).filter((c) => c > 0);
      const confidence = reported.length ? reported.reduce((a, b) => a + b, 0) / reported.length : undefined;
      const problem = validateTranscript(text, { maxLen: o.maxLen, confidence }) ?? o.validate?.(text) ?? null;
      if (problem) {
        setError(problem);
        return;
      }
      o.onResult(text);
    };

    try {
      setError(null);
      setInterim("");
      rec.current = r;
      r.start();
      setListening(true);
      armSilence();
    } catch {
      rec.current = null;
      setError(SPEECH_ERRORS.unknown);
    }
  }, [armSilence]);

  return { supported, listening, start, stop, interim, error };
}
