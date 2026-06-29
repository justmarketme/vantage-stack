#!/usr/bin/env npx tsx
/**
 * Short (~9s) welcome voiceover for the lip-synced intro video — kept tight so
 * the talking-head generation fits the free GPU budget AND so the on-screen
 * welcome isn't a long monologue before the form. Voiced with the SAME settings
 * as the LIVE agent (eleven_multilingual_v2, accent-anchored) so the recorded
 * welcome and the live chat sound like one continuous person.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/make-isabel-welcome-audio.ts
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveElevenLabsApiKey } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";
const VOICE_ID = (process.env.VS_VOICE_ID || "TTY70JqFvDxeExufZ1za").trim(); // Cay
const OUT = resolve(process.cwd(), "public/audio/isabel-welcome.mp3");

// Kept to ~4.5s — the talking-avatar model outputs ~5s clips, and a short, warm
// greeting hands straight to the live agent (which carries the rest).
const SCRIPT = `Hey, welcome! I'm Isabel. Let's build your blueprint.`;

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  if (!apiKey) { console.error("Missing ELEVEN_LABS_API_KEY"); process.exit(1); }
  const res = await fetch(`${API_BASE}/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey, Accept: "audio/mpeg" },
    body: Buffer.from(JSON.stringify({
      text: SCRIPT,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.38, similarity_boost: 0.92, style: 0.5, use_speaker_boost: true },
    }), "utf-8"),
  });
  if (!res.ok) { console.error("TTS failed:", res.status, (await res.text()).slice(0, 300)); process.exit(1); }
  writeFileSync(OUT, Buffer.from(await res.arrayBuffer()));
  console.log(`✅ Wrote ${OUT}`);
}
main();
