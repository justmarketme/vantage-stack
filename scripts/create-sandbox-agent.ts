#!/usr/bin/env npx tsx
/**
 * Create the ElevenLabs SANDBOX agent for /sandbox, by cloning production.
 *
 * WHY THIS EXISTS: the demo sandbox refuses to run against the production agent
 * (see lib/sandbox/config.ts) — that refusal is the whole point, since a demo
 * must never spend production minutes. But that leaves the feature inert until
 * a second agent exists. This creates one.
 *
 * It clones the production agent's conversation config so the sandbox sounds
 * identical, then enables the prompt/first_message overrides the sandbox UI
 * depends on, and names it distinctly so nobody confuses the two in the
 * dashboard.
 *
 * SAFE TO RE-RUN: it looks for an existing agent with the sandbox name first and
 * reports it rather than creating duplicates.
 *
 * Usage:
 *   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/create-sandbox-agent.ts
 *
 * Then put the printed id in .env.local AND in Vercel:
 *   NEXT_PUBLIC_ELEVENLABS_SANDBOX_AGENT_ID=agent_...
 */

import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";
const SANDBOX_NAME = "VS SANDBOX — demo only (no production minutes)";

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const prodId = resolveIsabelAgentId();
  if (!apiKey || !prodId) {
    console.error("Missing ELEVEN_LABS_API_KEY or NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    process.exit(1);
  }
  const headers = { "Content-Type": "application/json", "xi-api-key": apiKey };

  // ── Idempotency: do not create a second sandbox on a re-run ──────
  const listRes = await fetch(`${API_BASE}/convai/agents?page_size=100`, {
    headers: { "xi-api-key": apiKey },
  });
  if (listRes.ok) {
    const list = (await listRes.json()) as { agents?: { agent_id: string; name: string }[] };
    const existing = list.agents?.find((a) => a.name === SANDBOX_NAME);
    if (existing) {
      console.log("Sandbox agent already exists — not creating another.\n");
      console.log(`NEXT_PUBLIC_ELEVENLABS_SANDBOX_AGENT_ID=${existing.agent_id}`);
      return;
    }
  }

  // ── Clone production's conversation config ──────────────────────
  const getRes = await fetch(`${API_BASE}/convai/agents/${prodId}`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!getRes.ok) {
    console.error("GET production agent failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const prod = (await getRes.json()) as {
    name?: string;
    conversation_config?: Record<string, unknown>;
  };
  console.log(`cloning from: ${prod.name ?? prodId}`);

  /**
   * Strip the agent's tools from the clone.
   *
   * Two reasons, and the second matters more than the first:
   *  1. The create endpoint rejects a payload carrying BOTH `tools` and
   *     `tool_ids`, which production has.
   *  2. A demo agent must not be able to call production tools. Those tools
   *     book real appointments and write real records; a consultant rehearsing
   *     in front of a prospect should not be able to trigger them by accident.
   *     The sandbox is a conversation, not a live channel.
   */
  const cfg = JSON.parse(JSON.stringify(prod.conversation_config ?? {})) as Record<string, any>;
  if (cfg.agent?.prompt) {
    delete cfg.agent.prompt.tools;
    delete cfg.agent.prompt.tool_ids;
    delete cfg.agent.prompt.mcp_server_ids;
    delete cfg.agent.prompt.knowledge_base;
  }
  console.log("stripped: tools, tool_ids, mcp servers, knowledge base (demo agent must not act)");

  const createRes = await fetch(`${API_BASE}/convai/agents/create`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: SANDBOX_NAME,
      conversation_config: cfg,
      platform_settings: {
        overrides: {
          conversation_config_override: {
            // The sandbox sends BOTH on every session — a persona and an opener
            // per demo. Without these enabled the agent silently ignores them.
            agent: { prompt: { prompt: true }, first_message: true },
          },
        },
      },
    }),
  });

  if (!createRes.ok) {
    console.error("CREATE failed:", createRes.status, await createRes.text());
    process.exit(1);
  }

  const created = (await createRes.json()) as { agent_id?: string };
  if (!created.agent_id) {
    console.error("CREATE returned no agent_id:", JSON.stringify(created).slice(0, 300));
    process.exit(1);
  }

  // ── Prove the overrides actually stuck ──────────────────────────
  const verifyRes = await fetch(`${API_BASE}/convai/agents/${created.agent_id}`, {
    headers: { "xi-api-key": apiKey },
  });
  const verify = (await verifyRes.json()) as {
    platform_settings?: {
      overrides?: {
        conversation_config_override?: {
          agent?: { first_message?: boolean; prompt?: { prompt?: boolean } | boolean };
        };
      };
    };
  };
  const agentOv = verify.platform_settings?.overrides?.conversation_config_override?.agent ?? {};
  const promptOn =
    typeof agentOv.prompt === "object" ? Boolean(agentOv.prompt?.prompt) : Boolean(agentOv.prompt);

  console.log(`\ncreated: ${created.agent_id}`);
  console.log(`  first_message override: ${agentOv.first_message ? "ENABLED" : "DISABLED"}`);
  console.log(`  prompt override       : ${promptOn ? "ENABLED" : "DISABLED"}`);

  if (!promptOn || !agentOv.first_message) {
    console.error("\n⚠️  Agent created but overrides did not stick — enable them in the dashboard.");
  }

  console.log("\nAdd this to .env.local AND to Vercel (Production):");
  console.log(`NEXT_PUBLIC_ELEVENLABS_SANDBOX_AGENT_ID=${created.agent_id}`);
}

main();
