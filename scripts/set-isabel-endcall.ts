#!/usr/bin/env npx tsx
/**
 * Let Isabel END the voice call gracefully when the user wants to stop talking.
 * Enables the `end_call` built-in system tool (so she can hang up when someone
 * says goodbye / is done) and sets a silence backstop so an abandoned call ends
 * on its own. Preserves the other built-in tools, prompt, and tool_ids.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/set-isabel-endcall.ts
 */

import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";
const SILENCE_END_SECS = 40; // end an abandoned call after sustained silence

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const agentId = resolveIsabelAgentId();
  if (!apiKey || !agentId) {
    console.error("Missing ELEVEN_LABS_API_KEY or NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    process.exit(1);
  }
  const headers = { "Content-Type": "application/json", "xi-api-key": apiKey };

  const getRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
  if (!getRes.ok) {
    console.error("GET agent failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const cur = (await getRes.json()) as {
    conversation_config?: { turn?: Record<string, unknown>; agent?: { prompt?: Record<string, unknown> } };
  };
  const cc = cur.conversation_config ?? {};

  const turn = { ...(cc.turn ?? {}), silence_end_call_timeout: SILENCE_END_SECS };

  const { tools: _drop, ...prompt } = (cc.agent?.prompt ?? {}) as Record<string, unknown>;
  const builtIn = { ...((prompt.built_in_tools as Record<string, unknown>) ?? {}) };
  builtIn.end_call = {
    name: "end_call",
    description:
      "End the call gracefully when the user says goodbye, says they're done, or clearly wants to stop talking by voice. Acknowledge warmly and let them know they can continue by text first, then end.",
    response_timeout_secs: 20,
    type: "system",
    params: { system_tool_type: "end_call" },
  };
  prompt.built_in_tools = builtIn;

  const patchRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ conversation_config: { turn, agent: { prompt } } }),
  });
  if (!patchRes.ok) {
    console.error("PATCH failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }
  const updated = (await patchRes.json()) as {
    conversation_config?: { turn?: { silence_end_call_timeout?: number }; agent?: { prompt?: { built_in_tools?: { end_call?: unknown } } } };
  };
  console.log("✅ end_call + silence backstop set.");
  console.log("  silence_end_call_timeout:", updated.conversation_config?.turn?.silence_end_call_timeout);
  console.log("  end_call enabled:", Boolean(updated.conversation_config?.agent?.prompt?.built_in_tools?.end_call));
}

main();
