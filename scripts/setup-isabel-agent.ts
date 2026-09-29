#!/usr/bin/env npx tsx
/**
 * Create the Isabel agent via the ElevenLabs API (first-time setup).
 * 1. Uploads the knowledge base (content/isabel-knowledge-base.md)
 * 2. Creates the agent with the canonical persona + first message + voice
 * 3. Links the knowledge base to the agent
 * 4. Outputs the agent ID for .env.local
 *
 * Persona + first message come from lib/isabel/persona.ts (single source of
 * truth) — never inline a persona here.
 *
 * Usage: npm run isabel:setup-agent
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { ISABEL_SYSTEM_PROMPT as SYSTEM_PROMPT, ISABEL_FIRST_MESSAGE as FIRST_MESSAGE } from "../lib/isabel/persona";
import { resolveElevenLabsApiKey } from "./isabel-env";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_BASE = "https://api.elevenlabs.io/v1";

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  if (!apiKey) {
    console.error("Error: ELEVEN_LABS_API_KEY (or ELEVENLABS_API_KEY) required in .env.local");
    process.exit(1);
  }

  console.log("Step 1: Uploading knowledge base...");
  const kbPath = join(projectRoot, "content", "isabel-knowledge-base.md");
  const kbText = readFileSync(kbPath, "utf-8");

  const kbRes = await fetch(`${API_BASE}/convai/knowledge-base/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ text: kbText, name: "VantageStack Site Knowledge" }),
  });

  if (!kbRes.ok) {
    console.error("Knowledge base upload failed:", kbRes.status, await kbRes.text());
    process.exit(1);
  }

  const kbData = (await kbRes.json()) as { id?: string; name?: string };
  const docId = kbData.id;
  if (!docId) {
    console.error("No document ID in response");
    process.exit(1);
  }
  console.log("  Knowledge base uploaded:", docId);

  console.log("Step 2: Creating Isabel agent...");

  const agentPayload = {
    name: "Isabel",
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: "en",
        prompt: {
          prompt: SYSTEM_PROMPT,
          llm: "gpt-4o-mini",
          knowledge_base: [{ type: "text", name: "VantageStack Site Knowledge", id: docId, usage_mode: "auto" }],
        },
      },
      tts: {
        model_id: "eleven_multilingual_v2",
        voice_id: "EXAVITQu4vr4xnSDxMaL",
      },
    },
  };

  const agentRes = await fetch(`${API_BASE}/convai/agents/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify(agentPayload),
  });

  if (!agentRes.ok) {
    const errText = await agentRes.text();
    console.error("Agent creation failed:", agentRes.status, errText);
    process.exit(1);
  }

  const agentData = (await agentRes.json()) as { agent_id?: string };
  const agentId = agentData.agent_id;
  if (!agentId) {
    console.error("No agent_id in response");
    process.exit(1);
  }

  console.log("  Agent created:", agentId);
  console.log("\nDone! Add to .env.local:");
  console.log(`NEXT_PUBLIC_ELEVENLABS_AGENT_ID=${agentId}`);
}

main();
