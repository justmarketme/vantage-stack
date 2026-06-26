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

  const tts = {
    ...currentTts,
    voice_id: VOICE_ID,
    model_id: "eleven_multilingual_v2", // expressive + multilingual (SA English, Afrikaans, etc.)
    // 0.45 keeps her lively but steadier than 0.35 — tames the rising "high pitch
    // at the end of every sentence". Her warmth/energy now comes from the persona
    // (happy, eager word choice) rather than from very low stability alone.
    stability: 0.45,
    similarity_boost: 0.85,
    speed: 1.0, // natural, leading pace
    expressive_mode: true, // turn her expression up (enables natural laughter/emotion)
  };

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
