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
  // Default to the realtime EXPRESSIVE model (V3 Conversational) — confirmed
  // entitled on this account. NOTE: the agent model id is "eleven_v3_conversational",
  // NOT the non-streaming "eleven_v3" (which agents reject as expressive_tts_not_allowed).
  const MODEL = (process.env.VS_TTS_MODEL || "eleven_v3_conversational").trim();
  const STYLE = process.env.VS_STYLE ? Number(process.env.VS_STYLE) : undefined;
  const isV3 = MODEL.includes("v3_conversational") || MODEL === "eleven_v3";

  const tts: Record<string, unknown> = { ...currentTts, voice_id: VOICE_ID, model_id: MODEL };
  if (isV3) {
    // Expressive Mode is inherent to V3 Conversational. Stability / Speed /
    // Similarity / Style are NOT customizable for v3 — drop them so the agent
    // accepts the PATCH. Expression comes from the model + audio tags.
    delete tts.stability;
    delete tts.speed;
    delete tts.similarity_boost;
    delete tts.style;
    delete tts.expressive_mode;
    // Warm, on-brand audio tags she can lean on (laughs, warmth, empathy).
    // The agent schema expects SuggestedAudioTag objects, not bare strings.
    tts.suggested_audio_tags = (process.env.VS_AUDIO_TAGS || "Warmly,Empathetically,Excitedly,Enthusiastically,Chuckles,Laughing")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((tag) => ({ tag }));
  } else {
    tts.stability = 0.45;
    tts.similarity_boost = 0.85;
    tts.speed = 1.0;
    if (STYLE !== undefined) tts.style = STYLE;
    tts.expressive_mode = true;
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
