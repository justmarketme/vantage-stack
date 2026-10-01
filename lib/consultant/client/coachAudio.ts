/**
 * Pure helpers for Coach Alex spoken cues (used by hooks/consultant/useCoachAudio.ts).
 */

import type { CoachCard } from "../types";

export const CUE_MAX_WORDS = 6;

export type OutputKind = "headset" | "speaker" | "unknown";

/** Device labels that mean the sound goes into the rep's ears, not the room. */
const HEADSET_LABEL =
  /head ?set|head ?phone|ear ?bud|ear ?phone|earpiece|airpods|\bbuds\b|bluetooth|hands-?free|\bbt\b|jabra|plantronics|\bpoly\b|sennheiser|bose|beats|\bwh-|\bwf-|galaxy buds|pixel buds|jbl tune|logitech h|usb audio headset/i;
const SPEAKER_LABEL = /speaker|built-?in|internal|display audio|monitor|hdmi|displayport|tv\b/i;

export type OutputDevice = { kind: string; label: string; deviceId: string };

/**
 * Best-effort: is the DEFAULT audio output a headset?
 * Browsers only reveal labels after microphone permission (granted for calls),
 * and iOS Safari doesn't list outputs at all → "unknown" (ask the rep).
 */
export function detectOutput(devices: OutputDevice[]): OutputKind {
  const outputs = devices.filter((d) => d.kind === "audiooutput");
  if (outputs.length === 0) return "unknown";
  // Chrome lists the system default as deviceId "default" ("Default - Jabra Evolve…").
  const def = outputs.find((d) => d.deviceId === "default") ?? (outputs.length === 1 ? outputs[0] : null);
  if (!def || !def.label) return "unknown";
  if (HEADSET_LABEL.test(def.label)) return "headset";
  if (SPEAKER_LABEL.test(def.label)) return "speaker";
  return "unknown";
}

/**
 * ≤6-word spoken cue for a card the rep must react to, or null (guide cards
 * stay silent). "Too expensive / “What does it cost?”" → "Objection: too expensive".
 */
export function cueFor(card: Pick<CoachCard, "severity" | "title"> | null | undefined): string | null {
  if (!card || (card.severity !== "high_risk" && card.severity !== "stall")) return null;
  const head = card.title
    .split(/\s\/\s|:|—|–/)[0]
    .replace(/[“”"‘’'?!.,]/g, "")
    .trim()
    .toLowerCase();
  if (!head) return null;
  const label = card.severity === "high_risk" ? "Objection:" : "Stall:";
  const words = head.split(/\s+/).slice(0, CUE_MAX_WORDS - 1);
  return `${label} ${words.join(" ")}`;
}

/** Prefer a South African English voice, then any English voice, else the default. */
export function pickVoice<V extends { lang: string; default?: boolean }>(voices: V[]): V | null {
  const byLang = (re: RegExp) => voices.find((v) => re.test(v.lang.replace("_", "-")));
  return byLang(/^en-ZA$/i) ?? byLang(/^en-GB$/i) ?? byLang(/^en(-|$)/i) ?? null;
}
