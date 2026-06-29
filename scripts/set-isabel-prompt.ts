#!/usr/bin/env npx tsx
/**
 * Set Isabel's system prompt + greeting on the shared ElevenLabs ConvAI agent
 * (website widget + WhatsApp). Discovery-led conversation that guides good-fit
 * visitors to book a free 30-minute strategy call. Booking is performed by our
 * own code — Isabel emits a %%BOOK ...%% directive when she has name + email.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/set-isabel-prompt.ts
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

  const getRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
  if (!getRes.ok) {
    console.error("GET agent failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const current = (await getRes.json()) as { conversation_config?: { agent?: { prompt?: Record<string, unknown> } } };
  const currentPrompt = current.conversation_config?.agent?.prompt ?? {};
  // Drop `tools` if present — API rejects both `tools` and `tool_ids`.
  const { tools: _tools, ...promptRest } = currentPrompt as Record<string, unknown>;

  const body = {
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        prompt: { ...promptRest, prompt: SYSTEM_PROMPT },
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
  const updated = (await patchRes.json()) as { conversation_config?: { agent?: { prompt?: { prompt?: string } } } };
  const p = updated.conversation_config?.agent?.prompt?.prompt || "";
  console.log("✅ Isabel prompt updated. starts:", JSON.stringify(p.slice(0, 70)));
  console.log("booking directive present:", p.includes("%%BOOK"));
}

main();
