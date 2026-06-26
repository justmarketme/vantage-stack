#!/usr/bin/env npx tsx
/**
 * Generate Isabel's /blueprint intro voiceover (public/audio/isabel-intro.mp3).
 *
 * Goal: a genuinely HAPPY, warm, eager-to-help delivery with a light, polite
 * laugh — and NO rising "high pitch at the end of every sentence" (sentences end
 * declaratively; we use a steady stability so prosody doesn't swing up).
 *
 * Strategy:
 *   1. Try eleven_v3 (supports inline emotion tags: [warmly], [happy], [laughs]).
 *   2. Fall back to eleven_multilingual_v2 with a high `style` (more expressive)
 *      and steady stability, using the plain (tag-free) script.
 *
 * Voice: "Cay" (same voice as the live agent, so the intro and the live chat
 * sound like one person). Override with VS_VOICE_ID.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/make-isabel-intro-audio.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveElevenLabsApiKey } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";
const VOICE_ID = (process.env.VS_VOICE_ID || "TTY70JqFvDxeExufZ1za").trim(); // Cay
const OUT = resolve(process.cwd(), "public/audio/isabel-intro.mp3");

// Expressive, happy, declarative endings. v3 gets emotion tags; v2 gets the
// plain text (tags would be read aloud on v2).
const SCRIPT_V3 = `[warmly] Hey — hi, welcome! Lovely to have you here. I'm Isabel, from VantageStack, [happy] and I'm so glad you came. In the next two minutes, I'll help you map out your free growth blueprint — what's working well, what's slipping through the cracks, and where your fastest wins are hiding. And honestly? [laughs] this is the easy part. I'll guide you through every step — it's just a relaxed chat between us. So whenever you're ready, tap the button to talk to me, and let's get started together.`;

const SCRIPT_V2 = `Hey — hi, welcome! Lovely to have you here. I'm Isabel, from VantageStack, and I'm so glad you came. In the next two minutes, I'll help you map out your free growth blueprint — what's working well, what's slipping through the cracks, and where your fastest wins are hiding. And honestly? Ha — this is the easy part. I'll guide you through every step, it's just a relaxed chat between us. So whenever you're ready, tap the button to talk to me, and let's get started together.`;

async function tts(model: string, text: string, voiceSettings: Record<string, unknown>) {
  const apiKey = resolveElevenLabsApiKey();
  const body = JSON.stringify({ text, model_id: model, voice_settings: voiceSettings });
  const res = await fetch(`${API_BASE}/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey || "", Accept: "audio/mpeg" },
    // UTF-8 bytes so the em-dash survives.
    body: Buffer.from(body, "utf-8"),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`${model} -> ${res.status} ${msg.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!resolveElevenLabsApiKey()) {
    console.error("Missing ELEVEN_LABS_API_KEY");
    process.exit(1);
  }

  let audio: Buffer | null = null;
  try {
    console.log("→ Trying eleven_v3 (expressive + laughter tags)…");
    audio = await tts("eleven_v3", SCRIPT_V3, {
      stability: 0.5, // v3: 0.5 = "Natural" — steady prosody, no end-of-line upspeak
      similarity_boost: 0.9,
      style: 0.6,
      use_speaker_boost: true,
    });
    console.log("✅ eleven_v3 succeeded.");
  } catch (e) {
    console.warn("⚠️ eleven_v3 unavailable:", (e as Error).message);
    console.log("→ Falling back to eleven_multilingual_v2 (high style)…");
    audio = await tts("eleven_multilingual_v2", SCRIPT_V2, {
      stability: 0.5, // steady → tames the rising end-of-sentence pitch
      similarity_boost: 0.9,
      style: 0.55, // higher = more expressive / happier
      use_speaker_boost: true,
    });
    console.log("✅ eleven_multilingual_v2 succeeded.");
  }

  writeFileSync(OUT, audio);
  console.log(`✅ Wrote ${OUT} (${(audio.length / 1024).toFixed(1)} KB)`);
}

main();
