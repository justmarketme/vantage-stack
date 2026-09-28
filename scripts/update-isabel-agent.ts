#!/usr/bin/env npx tsx
/**
 * Full config refresh for the Isabel agent: re-applies the canonical persona,
 * voice/turn settings, and (re)attaches the website URL knowledge base.
 *
 * Persona + first message come from lib/isabel/persona.ts (single source of
 * truth). The agent id comes from NEXT_PUBLIC_ELEVENLABS_AGENT_ID — never
 * hardcoded — so this always targets the same live agent as the other scripts.
 *
 * Usage: npx tsx scripts/update-isabel-agent.ts
 */

import { ISABEL_SYSTEM_PROMPT as SYSTEM_PROMPT, ISABEL_FIRST_MESSAGE as FIRST_MESSAGE } from "../lib/isabel/persona";
import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";

async function apiFetch(path: string, method: string, body?: unknown) {
  const key = resolveElevenLabsApiKey();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "xi-api-key": key },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const agentId = resolveIsabelAgentId();
  if (!apiKey) {
    console.error("❌ ELEVEN_LABS_API_KEY (or ELEVENLABS_API_KEY) not found in env or .env.local");
    process.exit(1);
  }
  if (!agentId) {
    console.error("❌ NEXT_PUBLIC_ELEVENLABS_AGENT_ID not found in env or .env.local");
    process.exit(1);
  }
  console.log("✅ API key + agent id found");

  // Step 1: Add website as URL knowledge base document
  console.log("\nStep 1: Adding website URL to knowledge base...");
  const urlKbRes = await apiFetch("/convai/knowledge-base/url", "POST", {
    url: "https://vantagestack.co.za/",
    name: "VantageStack Website",
  });

  let urlDocId: string | null = null;
  if (urlKbRes.ok) {
    const urlKbData = (await urlKbRes.json()) as { id?: string };
    urlDocId = urlKbData.id || null;
    console.log("  Website KB doc ID:", urlDocId);
  } else {
    const errText = await urlKbRes.text();
    console.warn("  ⚠️ Could not add URL knowledge base:", urlKbRes.status, errText);
    console.warn("  Continuing with existing knowledge base only...");
  }

  // Step 2: Get current agent to see existing knowledge base docs
  console.log("\nStep 2: Fetching current agent config...");
  const getRes = await apiFetch(`/convai/agents/${agentId}`, "GET");
  if (!getRes.ok) {
    console.error("❌ Could not fetch agent:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const currentAgent = (await getRes.json()) as {
    conversation_config?: {
      agent?: {
        prompt?: { knowledge_base?: Array<{ type: string; name: string; id: string; usage_mode: string }> };
      };
    };
  };

  const existingKb = currentAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
  console.log("  Existing KB docs:", existingKb.length);

  // Keep existing KB, add the new URL doc if we got one (avoid duplicates).
  const knowledgeBase = [...existingKb];
  if (urlDocId && !knowledgeBase.find((k) => k.id === urlDocId)) {
    knowledgeBase.push({ type: "url", name: "VantageStack Website", id: urlDocId, usage_mode: "auto" });
  }

  // Step 3: Patch the agent
  console.log("\nStep 3: Updating Isabel agent...");
  const patchPayload = {
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: "gpt-4o-mini",
          knowledge_base: knowledgeBase,
        },
      },
      tts: {
        model_id: "eleven_multilingual_v2",
        voice_id: "TTY70JqFvDxeExufZ1za",
        agent_output_audio_format: "pcm_16000",
        voice_settings: {
          stability: 0.25,
          similarity_boost: 0.8,
          style: 0.75,
          speed: 1.15,
          use_speaker_boost: true,
        },
      },
      turn: {
        turn_timeout: 7,
        silence_end_call_timeout: -1,
      },
    },
  };

  const patchRes = await apiFetch(`/convai/agents/${agentId}`, "PATCH", patchPayload);
  if (!patchRes.ok) {
    const errText = await patchRes.text();
    console.error("❌ Agent update failed:", patchRes.status, errText);
    process.exit(1);
  }

  const patchData = (await patchRes.json()) as { agent_id?: string };
  console.log("  ✅ Agent updated:", patchData.agent_id || agentId);
  console.log("\n✅ Done! Isabel refreshed with:");
  console.log("   • Canonical NEPQ persona (lib/isabel/persona.ts)");
  console.log("   • Voice: eleven_multilingual_v2 | speed 1.15 | stability 25% | style 75%");
  if (urlDocId) console.log("   • Knowledge base: VantageStack website URL added");
}

main();
