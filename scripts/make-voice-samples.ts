#!/usr/bin/env npx tsx
/**
 * Generate side-by-side voice SAMPLES for choosing Isabel's LIVE voice.
 *
 * Rendered with the EXACT live-agent model + settings (eleven_multilingual_v2,
 * stability 0.45) so what you hear is what the live chat will actually sound
 * like — NOT the richer v3 (which the plan blocks for realtime).
 *
 * Pulls a few warm South-African female voices from the shared library and adds
 * the three we already know, then writes one mp3 per voice to C:/tmp/voice-samples.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/make-voice-samples.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { resolveElevenLabsApiKey } from "./isabel-env";

const API = "https://api.elevenlabs.io/v1";
const OUT_DIR = "C:/tmp/voice-samples";
const MODEL = "eleven_multilingual_v2";
const SETTINGS = { stability: 0.45, similarity_boost: 0.85, style: 0, use_speaker_boost: true };

const LINE =
  "Hey, welcome! I'm Isabel from VantageStack. Let's map out a quick plan to grow your business - it only takes a couple of minutes, and I'll guide you the whole way. Ready when you are.";

// Voices we already know are warm SA female options.
const KNOWN: { name: string; id: string }[] = [
  { name: "Cay (current)", id: "TTY70JqFvDxeExufZ1za" },
  { name: "Ava", id: "x8syuETaTA9JYwAbE2JM" },
  { name: "Thandi", id: "BcpjRWrYhDBHmOnetmBl" },
];

async function fetchSharedSaFemale(apiKey: string): Promise<{ name: string; id: string }[]> {
  try {
    const url = `${API}/shared-voices?gender=female&page_size=30&search=south%20african`;
    const res = await fetch(url, { headers: { "xi-api-key": apiKey } });
    if (!res.ok) return [];
    const j = (await res.json()) as { voices?: Array<Record<string, unknown>> };
    const out: { name: string; id: string }[] = [];
    for (const v of j.voices ?? []) {
      const accent = String((v.accent as string) ?? "").toLowerCase();
      const name = String((v.name as string) ?? "").trim();
      const id = String((v.voice_id as string) ?? "").trim();
      if (!id || !name) continue;
      if (accent.includes("south") || /south\s*africa/i.test(JSON.stringify(v))) {
        out.push({ name, id });
      }
      if (out.length >= 4) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function tts(apiKey: string, voiceId: string): Promise<Buffer | null> {
  const body = JSON.stringify({ text: LINE, model_id: MODEL, voice_settings: SETTINGS });
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey, Accept: "audio/mpeg" },
    body: Buffer.from(body, "utf-8"),
  });
  if (!res.ok) {
    console.warn(`  ⚠️ ${voiceId} -> ${res.status} ${(await res.text()).slice(0, 140)}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  if (!apiKey) {
    console.error("Missing ELEVEN_LABS_API_KEY");
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const shared = await fetchSharedSaFemale(apiKey);
  // De-dupe by id against the known list.
  const seen = new Set(KNOWN.map((k) => k.id));
  const list = [...KNOWN, ...shared.filter((s) => !seen.has(s.id))];

  console.log(`Rendering ${list.length} samples (model ${MODEL}, stability ${SETTINGS.stability}):`);
  const written: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    process.stdout.write(`  ${i + 1}. ${v.name} (${v.id}) ... `);
    const audio = await tts(apiKey, v.id);
    if (!audio) continue;
    const fp = `${OUT_DIR}/${String(i + 1).padStart(2, "0")}-${slug(v.name)}.mp3`;
    writeFileSync(fp, audio);
    written.push(fp);
    console.log("ok");
  }
  console.log(`\n✅ ${written.length} samples in ${OUT_DIR}`);
  written.forEach((w) => console.log("  " + w));
}

main();
