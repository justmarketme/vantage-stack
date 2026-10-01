"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normaliseForKind, validateSpoken, type SpokenKind } from "../../lib/consultant/client/speech";

/**
 * Dictation for a single field via the Web Speech API.
 *
 *   const mic = useSpeechInput({ kind: "email", onResult: (v) => setEmail(v) });
 *   const nameMic = useSpeechInput({ kind: "name", onResult: setContactName }); // SA names fixed
 *
 * Kinds: "email" | "url" | "phone" (SA +27 only — foreign numbers are
 * rejected with a clear message) | "name" (South African first names and
 * surnames: spelling + casing, e.g. "tandeka van der merwe" → "Thandeka van
 * der Merwe") | "text" (free dictation).
 *   {mic.supported && <MicButton onClick={mic.listening ? mic.stop : mic.start} />}
 *
 * - `SpeechRecognition || webkitSpeechRecognition`; `supported` is false
 *   until mount (SSR-safe) and stays false where there's no engine (Firefox,
 *   some iOS WebViews). iOS Safari's engine is partial: we use single-shot
 *   mode for structured kinds and never assume `continuous` works.
 * - Interim results are shown already normalised for the field kind.
 * - On a final result the text is normalised + validated with the contract
 *   zod rules; `onResult` only receives a valid value. Otherwise `error` is set
 *   (the best-effort value is passed as `onInvalid` if provided).
 * - Stops on window blur, tab hide and unmount. Nothing is logged.
 */

export interface UseSpeechInputOptions {
  kind: SpokenKind;
  onResult: (value: string) => void;
  /** Additive: receives the best-effort value when validation fails. */
  onInvalid?: (value: string, error: string) => void;
  /** BCP-47 language. Default "en-ZA". */
  lang?: string;
  /** Stop after this long without new speech. Default 3s (6s for free text). */
  silenceMs?: number;
}

export interface UseSpeechInputResult {
  supported: boolean;
  listening: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

/* Structural types — lib.dom doesn't ship SpeechRecognition everywhere. */
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
  onaudiostart?: (() => void) | null;
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

export const SPEECH_ERRORS: Record<string, string> = {
  "not-allowed": "Microphone access is blocked. Allow it in your browser's site settings to use voice input.",
  "service-not-allowed": "Voice input isn't allowed in this browser. You can type instead.",
  "no-speech": "We didn't hear anything. Tap the mic and try again.",
  "audio-capture": "No microphone was found. Check that one is connected.",
  network: "Voice input needs a data connection. Type it for now.",
  "language-not-supported": "Voice input doesn't support this language on this device.",
  unsupported: "Voice input isn't available in this browser. You can type instead.",
  unknown: "Voice input stopped unexpectedly. Try again.",
};

export function mapSpeechError(code: string): string | null {
  if (code === "aborted") return null; // we (or the user) stopped it
  return SPEECH_ERRORS[code] ?? SPEECH_ERRORS.unknown;
}

export function useSpeechInput(opts: UseSpeechInputOptions): UseSpeechInputResult {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rec = useRef<SRInstance | null>(null);
  const silence = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finals = useRef<string[]>([]);
  const failed = useRef(false);
  const discard = useRef(false);
  const mounted = useRef(true);
  /** Audio capture has begun (i.e. any permission prompt is gone). */
  const capturing = useRef(false);

  const clearSilence = () => {
    if (silence.current) clearTimeout(silence.current);
    silence.current = null;
  };

  const stop = useCallback(() => {
    clearSilence();
    try {
      rec.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  /** Abort without delivering a result (blur / hide / unmount). */
  const abort = useCallback(() => {
    clearSilence();
    discard.current = true;
    try {
      rec.current?.abort();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setSupported(getSpeechRecognition() !== null);
    const onHide = () => {
      if (document.visibilityState === "hidden") abort();
    };
    // The mic permission prompt blurs the window on some mobiles — only a blur
    // AFTER capture started means the user left.
    const onBlur = () => {
      if (capturing.current) abort();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      mounted.current = false;
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onHide);
      abort();
      rec.current = null;
    };
  }, [abort]);

  const armSilence = useCallback(() => {
    clearSilence();
    const o = optsRef.current;
    const ms = o.silenceMs ?? (o.kind === "text" ? 6_000 : 3_000);
    silence.current = setTimeout(stop, ms);
  }, [stop]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setError(SPEECH_ERRORS.unsupported);
      return;
    }
    if (rec.current) return;
    let r: SRInstance;
    try {
      r = new Ctor();
    } catch {
      setError(SPEECH_ERRORS.unsupported);
      return;
    }
    const kind = optsRef.current.kind;
    r.lang = optsRef.current.lang ?? "en-ZA";
    // Structured fields are one utterance; iOS Safari is unreliable in continuous mode anyway.
    r.continuous = kind === "text";
    r.interimResults = true;
    r.maxAlternatives = 1;
    finals.current = [];
    failed.current = false;
    discard.current = false;
    capturing.current = false;

    r.onaudiostart = () => {
      capturing.current = true;
    };
    r.onresult = (e) => {
      capturing.current = true;
      armSilence();
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alt = res?.[0];
        if (!alt) continue;
        if (res.isFinal) finals.current.push(alt.transcript);
        else partial += alt.transcript;
      }
      if (!mounted.current) return;
      const soFar = `${finals.current.join(" ")} ${partial}`.trim();
      setInterim(soFar ? normaliseForKind(optsRef.current.kind, soFar) : "");
    };
    r.onerror = (e) => {
      const msg = mapSpeechError(e?.error ?? "unknown");
      if (msg) {
        failed.current = true;
        if (mounted.current) setError(msg);
      }
    };
    r.onend = () => {
      clearSilence();
      rec.current = null;
      capturing.current = false;
      if (!mounted.current) return;
      setListening(false);
      setInterim("");
      if (failed.current || discard.current) return;
      const raw = finals.current.join(" ").trim();
      if (!raw) {
        setError(SPEECH_ERRORS["no-speech"]);
        return;
      }
      const o = optsRef.current;
      const v = validateSpoken(o.kind, raw);
      if (v.ok) {
        setError(null);
        o.onResult(v.value);
      } else {
        setError(v.error ?? SPEECH_ERRORS.unknown);
        o.onInvalid?.(v.value, v.error ?? "");
      }
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

  return { supported, listening, interim, error, start, stop };
}
