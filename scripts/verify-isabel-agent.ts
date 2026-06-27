#!/usr/bin/env npx tsx
/**
 * Read-only sanity check of the LIVE Isabel agent config: TTS model, voice,
 * audio tags, that the persona has the latest sections, and the blueprint tools
 * are attached. Prints a pass/fail summary.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-isabel-agent.ts
 */

import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const agentId = resolveIsabelAgentId();
  if (!apiKey || !agentId) {
    console.error("Missing ELEVEN_LABS_API_KEY or NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    process.exit(1);
  }
  const res = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
  if (!res.ok) {
    console.error("GET failed:", res.status, await res.text());
    process.exit(1);
  }
  const a = (await res.json()) as {
    conversation_config?: {
      tts?: { model_id?: string; voice_id?: string; suggested_audio_tags?: Array<{ tag?: string }> };
      agent?: { prompt?: { prompt?: string; tool_ids?: string[] } };
    };
  };
  const tts = a.conversation_config?.tts ?? {};
  const prompt = a.conversation_config?.agent?.prompt ?? {};
  const sys = prompt.prompt ?? "";
  const tags = (tts.suggested_audio_tags ?? []).map((t) => t.tag).filter(Boolean);

  const checks: [string, boolean, string][] = [
    ["TTS model is V3 Conversational (expressive)", tts.model_id === "eleven_v3_conversational", String(tts.model_id)],
    ["Voice is Cay", tts.voice_id === "TTY70JqFvDxeExufZ1za", String(tts.voice_id)],
    ["Audio tags include Laughing", tags.includes("Laughing"), tags.join(", ") || "(none)"],
    ["Persona: South African flavour", /South African voice & flavour/.test(sys), ""],
    ["Persona: real blueprint questions", /ask in THIS exact order/.test(sys), ""],
    ["Persona: music control", /controlBlueprintMusic/.test(sys), ""],
    ["Blueprint tools attached (8)", (prompt.tool_ids?.length ?? 0) === 8, String(prompt.tool_ids?.length ?? 0)],
  ];

  let ok = true;
  for (const [name, pass, detail] of checks) {
    console.log(`${pass ? "✅" : "❌"} ${name}${detail ? `  [${detail}]` : ""}`);
    if (!pass) ok = false;
  }
  console.log(ok ? "\n🎉 All good — live agent is expressive + persona/tools intact." : "\n⚠️ Some checks failed.");
  process.exit(ok ? 0 : 1);
}

main();
