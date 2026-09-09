#!/usr/bin/env npx tsx
/**
 * Restore Isabel's canonical VantageStack persona on the ElevenLabs ConvAI
 * agent, undoing any demo persona (e.g. a "Laser Cats / Sparky" demo).
 *
 * IMPORTANT: this re-applies the SAME canonical persona as set-isabel-prompt.ts
 * (imported from lib/isabel/persona.ts). It can no longer silently downgrade the
 * live NEPQ persona — "restore" means "restore to canonical", nothing else.
 * Only the system prompt + first message change; the LLM and the attached
 * knowledge base are preserved exactly as configured.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/restore-isabel-prompt.ts
 */

import { ISABEL_SYSTEM_PROMPT as SYSTEM_PROMPT, ISABEL_FIRST_MESSAGE as FIRST_MESSAGE } from "../lib/isabel/persona";
import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const agentId = resolveIsabelAgentId();
  if (!apiKey || !agentId) {
    console.error("Missing ELEVEN_LABS_API_KEY or NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    process.exit(1);
  }

  // Read current config so we preserve llm + knowledge_base.
  const getRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
  if (!getRes.ok) {
    console.error("Failed to fetch agent:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const current = (await getRes.json()) as { conversation_config?: { agent?: { prompt?: Record<string, unknown> } } };
  const currentPrompt = current?.conversation_config?.agent?.prompt ?? {};
  // Drop `tools` if present — API rejects both `tools` and `tool_ids`.
  const { tools: _tools, ...promptRest } = currentPrompt as Record<string, unknown>;

  const body = {
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        prompt: { ...promptRest, prompt: SYSTEM_PROMPT }, // keep llm, knowledge_base, etc.
      },
    },
  };

  const patchRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify(body),
  });
  if (!patchRes.ok) {
    console.error("PATCH failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }

  const updated = (await patchRes.json()) as {
    conversation_config?: { agent?: { first_message?: string; prompt?: { prompt?: string; knowledge_base?: unknown } } };
  };
  const p = updated?.conversation_config?.agent?.prompt;
  console.log("✅ Isabel restored to canonical persona.");
  console.log("first_message:", JSON.stringify(updated?.conversation_config?.agent?.first_message)?.slice(0, 120));
  console.log("prompt starts:", JSON.stringify(p?.prompt)?.slice(0, 80));
  console.log("booking directive present:", String(p?.prompt || "").includes("%%BOOK"));
  console.log("knowledge_base:", JSON.stringify(p?.knowledge_base));
}

main();
