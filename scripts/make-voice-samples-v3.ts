#!/usr/bin/env npx tsx
/**
 * v3 (Expressive) voice samples across accents — to choose Isabel's voice and
 * test the "studio voice driven hard as a Joburg South African" idea.
 *
 * Renders each candidate on the eleven_v3 model (the expressive studio quality
 * the live agent now uses as eleven_v3_conversational), saying the SAME line:
 * heavy SA idiom (howzit, hey) + warmth + a laugh, so you can hear how each
 * accent carries the South African word-choice.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/make-voice-samples-v3.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolveElevenLabsApiKey } from "./isabel-env";

const API = "https://api.elevenlabs.io/v1";
const OUT_DIR = "C:/tmp/voice-samples-v3";
const MODEL = "eleven_v3";
const SETTINGS = { stability: 0.5, similarity_boost: 0.9, use_speaker_boost: true };

// SA idiom + warmth + a laugh, with v3 audio tags.
const LINE = `[warmly] Hey, howzit — welcome! I'm Isabel, from VantageStack, lovely to have you here. Let's map out a quick plan to grow your business — honestly, it's the easy part, and I'll guide you the whole way. [laughs] Ready when you are, hey?`;

// Curated cross-accent female candidates. Premade ids are stable across accounts;
// the SA library voices we already use are included for reference.
const VOICES: { name: string; id: string; accent: string }[] = [
  { name: "Cay (current)", id: "TTY70JqFvDxeExufZ1za", accent: "South African" },
  { name: "Ava", id: "x8syuETaTA9JYwAbE2JM", accent: "South African" },
  { name: "Thandi", id: "BcpjRWrYhDBHmOnetmBl", accent: "South African" },
  { name: "Alice", id: "Xb7hH8MSUJpSbSDYk0k2", accent: "British" },
  { name: "Lily", id: "pFZP5JQG7iQjIQuC4Bku", accent: "British" },
  { name: "Charlotte", id: "XB0fDUnXU5powFXDhCwa", accent: "British/soft" },
  { name: "Matilda", id: "XrExE9yKIg1WjnnlVkGX", accent: "Neutral/American" },
  { name: "Jessica", id: "cgSgspJ2msm6clMCkdW9", accent: "Expressive/American" },
];

async function tts(apiKey: string, voiceId: string): Promise<Buffer | null> {
  const body = JSON.stringify({ text: LINE, model_id: MODEL, voice_settings: SETTINGS });
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey, Accept: "audio/mpeg" },
    body: Buffer.from(body, "utf-8"),
  });
  if (!res.ok) {
    console.warn(`  ⚠️ ${voiceId} -> ${res.status} ${(await res.text()).slice(0, 160)}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  if (!apiKey) {
    console.error("Missing ELEVEN_LABS_API_KEY");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`Rendering ${VOICES.length} v3 samples:`);
  const written: string[] = [];
  for (let i = 0; i < VOICES.length; i++) {
    const v = VOICES[i];
    process.stdout.write(`  ${i + 1}. ${v.name} [${v.accent}] ... `);
    const audio = await tts(apiKey, v.id);
    if (!audio) continue;
    const fp = `${OUT_DIR}/${String(i + 1).padStart(2, "0")}-${slug(v.name)}-${slug(v.accent)}.mp3`;
    writeFileSync(fp, audio);
    written.push(fp);
    console.log("ok");
  }
  console.log(`\n✅ ${written.length} samples in ${OUT_DIR}`);
  written.forEach((w) => console.log("  " + w));
}

main();
