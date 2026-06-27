#!/usr/bin/env npx tsx
/**
 * Set Isabel's voice to the best South African voice and turn her expression up,
 * including the ability to laugh politely. Merges over the existing TTS config so
 * other fields (audio format, latency) are preserved.
 *
 * Voice: "Cay" — warm, persuasive, polished South African sales voice.
 * Override VS_VOICE_ID env to use a different library voice (e.g. Ava, Thandi).
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/set-isabel-voice.ts
 */

import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";

// Best South African female voices from the library (swap via VS_VOICE_ID):
//   Cay    TTY70JqFvDxeExufZ1za  warm, persuasive, polished SA sales woman  (default)
//   Ava    x8syuETaTA9JYwAbE2JM  conversational, playful, vibrant SA
//   Thandi BcpjRWrYhDBHmOnetmBl  clear, warm, engaging young SA
const VOICE_ID = (process.env.VS_VOICE_ID || "TTY70JqFvDxeExufZ1za").trim();

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const agentId = resolveIsabelAgentId();
  if (!apiKey || !agentId) {
    console.error("Missing ELEVEN_LABS_API_KEY or NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    process.exit(1);
  }
  const headers = { "Content-Type": "application/json", "xi-api-key": apiKey };

  // Preserve the existing tts object and override the expressiveness levers.
  const getRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
  if (!getRes.ok) {
    console.error("GET agent failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const current = (await getRes.json()) as { conversation_config?: { tts?: Record<string, unknown> } };
  const currentTts = current.conversation_config?.tts ?? {};

  // Model is overridable so we can test whether the warmer eleven_v3 (the voice
  // used in the intro video) works for the LIVE realtime agent. ConvAI realtime
  // historically only supports the turbo/flash/multilingual_v2 family — if v3 is
  // rejected or breaks audio, fall back to multilingual_v2 with higher `style`.
  // Default = the WARM-BUT-STABLE middle ground: eleven_multilingual_v2 at high
  // stability. v3_conversational is more expressive but DRIFTS the SA accent toward
  // American (it's a minority accent and v3's loose sampling lets it wander); v2 at
  // higher stability holds the accent while staying warmer than turbo/flash.
  // Override with VS_TTS_MODEL=eleven_v3_conversational for the expressive (drifty) path.
  const MODEL = (process.env.VS_TTS_MODEL || "eleven_multilingual_v2").trim();
  const STABILITY = process.env.VS_STABILITY ? Number(process.env.VS_STABILITY) : 0.6;
  const isV3 = MODEL.includes("v3_conversational") || MODEL === "eleven_v3";

  const tts: Record<string, unknown> = { ...currentTts, voice_id: VOICE_ID, model_id: MODEL };
  if (isV3) {
    // Expressive Mode is inherent to V3 Conversational; stability/speed/similarity
    // are not customizable. Warm audio tags (laughs, warmth) — SuggestedAudioTag objects.
    delete tts.stability;
    delete tts.speed;
    delete tts.similarity_boost;
    delete tts.style;
    delete tts.expressive_mode;
    tts.suggested_audio_tags = (process.env.VS_AUDIO_TAGS || "Warmly,Empathetically,Excitedly,Enthusiastically,Chuckles,Laughing")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((tag) => ({ tag }));
  } else {
    // Higher stability = tighter accent adherence (less drift) while staying warm.
    tts.stability = STABILITY;
    tts.similarity_boost = 0.85;
    tts.speed = 1.0;
    tts.expressive_mode = true; // ignored by ConvAI but harmless
    tts.suggested_audio_tags = []; // v3-only — clear them so they can't loosen the accent
  }

  const patchRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ conversation_config: { tts } }),
  });
  if (!patchRes.ok) {
    console.error("PATCH failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }
  const updated = (await patchRes.json()) as { conversation_config?: { tts?: Record<string, unknown> } };
  console.log("✅ Isabel voice + expression updated.");
  console.log(JSON.stringify(updated.conversation_config?.tts ?? {}, null, 2));
}

main();
