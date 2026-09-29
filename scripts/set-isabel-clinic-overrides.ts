#!/usr/bin/env npx tsx
/**
 * Enable the override allowlist entries the clinics page depends on.
 *
 * ElevenLabs ignores any `overrides` a client sends unless the corresponding
 * flag is switched on for the agent. `set-isabel-overrides.ts` already enables
 * `agent.first_message`; the clinics page ALSO sends `agent.prompt`, so without
 * this the clinic persona is silently dropped and Isabel answers as the generic
 * VantageStack assistant. Silently is the problem — there is no error, she just
 * says the wrong things.
 *
 * Read-modify-write on platform_settings so nothing already configured is lost.
 * Prints before/after so the change is auditable.
 *
 * Usage:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/set-isabel-clinic-overrides.ts
 */

import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";

type Cco = {
  agent?: { first_message?: boolean; prompt?: { prompt?: boolean } | boolean; language?: boolean };
};

function describe(cco: Cco | undefined) {
  const agent = (cco?.agent ?? {}) as Record<string, unknown>;
  const prompt = agent.prompt as { prompt?: boolean } | boolean | undefined;
  return {
    first_message: Boolean(agent.first_message),
    prompt: typeof prompt === "object" ? Boolean(prompt?.prompt) : Boolean(prompt),
  };
}

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

  const cur = (await getRes.json()) as { name?: string; platform_settings?: Record<string, unknown> };
  const ps = (cur.platform_settings ?? {}) as Record<string, unknown>;
  const overrides = (ps.overrides ?? {}) as Record<string, unknown>;
  const cco = (overrides.conversation_config_override ?? {}) as Record<string, unknown>;
  const agent = (cco.agent ?? {}) as Record<string, unknown>;

  console.log(`agent: ${cur.name ?? agentId}`);
  console.log("before:", describe(cco as Cco));

  // Both are required by the clinics page. first_message is also used by
  // /blueprint, so it is set defensively rather than assumed.
  agent.first_message = true;
  // The API models prompt override as a nested object, not a bare boolean.
  agent.prompt = { prompt: true };

  cco.agent = agent;
  overrides.conversation_config_override = cco;
  ps.overrides = overrides;

  const patchRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ platform_settings: ps }),
  });
  if (!patchRes.ok) {
    console.error("PATCH failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }

  const updated = (await patchRes.json()) as {
    platform_settings?: { overrides?: { conversation_config_override?: Cco } };
  };
  const after = describe(updated.platform_settings?.overrides?.conversation_config_override);
  console.log("after: ", after);

  if (!after.prompt || !after.first_message) {
    console.error("\n❌ The API accepted the PATCH but the flags did not stick. Check the dashboard.");
    process.exit(1);
  }
  console.log("\n✅ Clinic persona overrides are live.");
}

main();
