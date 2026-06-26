#!/usr/bin/env npx tsx
/**
 * Declare Isabel's form-driving CLIENT tools on the live agent so the LLM knows
 * to call them while guiding someone through the blueprint. Creates each tool via
 * POST /v1/convai/tools (deduped by name), then attaches them to the agent's
 * prompt.tool_ids — PRESERVING any existing tool_ids.
 *
 * Outward-facing: mutates the LIVE shared agent. The persona scopes these tools
 * to the website blueprint guidance only.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/set-isabel-tools.ts
 */

import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";
import { BLUEPRINT_TOOL_DEFINITIONS } from "../lib/blueprint/voice-tools";

const API_BASE = "https://api.elevenlabs.io/v1";

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const agentId = resolveIsabelAgentId();
  if (!apiKey || !agentId) {
    console.error("Missing ELEVEN_LABS_API_KEY or NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    process.exit(1);
  }
  const headers = { "Content-Type": "application/json", "xi-api-key": apiKey };

  // Existing workspace tools (dedupe by name).
  const listRes = await fetch(`${API_BASE}/convai/tools`, { headers: { "xi-api-key": apiKey } });
  const existingTools: Array<{ id?: string; tool_config?: { name?: string } }> = listRes.ok
    ? ((await listRes.json()) as { tools?: Array<{ id?: string; tool_config?: { name?: string } }> }).tools ?? []
    : [];
  const byName = new Map(existingTools.map((t) => [t.tool_config?.name, t.id]));

  const toolIds: string[] = [];
  for (const def of BLUEPRINT_TOOL_DEFINITIONS) {
    const existingId = byName.get(def.name);
    if (existingId) {
      console.log(`• ${def.name} — already exists (${existingId})`);
      toolIds.push(existingId);
      continue;
    }
    const tool_config = {
      type: "client",
      name: def.name,
      description: def.description,
      expects_response: false,
      parameters: {
        type: "object",
        properties: def.parameters,
        required: def.required,
      },
    };
    const res = await fetch(`${API_BASE}/convai/tools`, { method: "POST", headers, body: JSON.stringify({ tool_config }) });
    if (!res.ok) {
      console.error(`✗ create ${def.name} failed:`, res.status, await res.text());
      process.exit(1);
    }
    const created = (await res.json()) as { id?: string };
    if (created.id) {
      console.log(`✓ created ${def.name} (${created.id})`);
      toolIds.push(created.id);
    }
  }

  // Attach to the agent, preserving existing tool_ids.
  const getRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
  if (!getRes.ok) {
    console.error("GET agent failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const current = (await getRes.json()) as { conversation_config?: { agent?: { prompt?: Record<string, unknown> } } };
  const prompt = (current.conversation_config?.agent?.prompt ?? {}) as Record<string, unknown>;
  const { tools: _drop, ...promptRest } = prompt;
  const existingIds = Array.isArray(prompt.tool_ids) ? (prompt.tool_ids as string[]) : [];
  const merged = Array.from(new Set([...existingIds, ...toolIds]));

  const patchRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ conversation_config: { agent: { prompt: { ...promptRest, tool_ids: merged } } } }),
  });
  if (!patchRes.ok) {
    console.error("PATCH agent failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }
  console.log(`\n✅ Attached ${toolIds.length} blueprint tools. Agent tool_ids now: ${merged.length}`);
}

main();
