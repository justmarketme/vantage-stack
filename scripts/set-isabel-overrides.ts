#!/usr/bin/env npx tsx
/**
 * Allow the client to override Isabel's first_message per session, so /blueprint
 * can use a blueprint-specific spoken intro. Preserves the rest of the override
 * allowlist; only flips agent.first_message to true.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/set-isabel-overrides.ts
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
  const headers = { "Content-Type": "application/json", "xi-api-key": apiKey };

  const getRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
  if (!getRes.ok) {
    console.error("GET agent failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const cur = (await getRes.json()) as { platform_settings?: Record<string, unknown> };
  const ps = (cur.platform_settings ?? {}) as Record<string, unknown>;
  const overrides = (ps.overrides ?? {}) as Record<string, unknown>;
  const cco = (overrides.conversation_config_override ?? {}) as Record<string, unknown>;
  const agent = (cco.agent ?? {}) as Record<string, unknown>;
  agent.first_message = true;
  cco.agent = agent;
  overrides.conversation_config_override = cco;
  ps.overrides = overrides;

  const patchRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ platform_settings: ps }),
  });
  if (!patchRes.ok) {
    console.error("PATCH failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }
  const updated = (await patchRes.json()) as {
    platform_settings?: { overrides?: { conversation_config_override?: { agent?: { first_message?: boolean } } } };
  };
  console.log(
    "✅ first_message override enabled:",
    updated.platform_settings?.overrides?.conversation_config_override?.agent?.first_message,
  );
}

main();
