#!/usr/bin/env npx tsx
/**
 * Update Isabel agent with new persona, voice settings, and website knowledge base.
 * Usage: npx tsx scripts/update-isabel-agent.ts
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

function getApiKey(): string {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (apiKey) return apiKey;
  const envPath = join(projectRoot, ".env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("ELEVENLABS_API_KEY=") && !trimmed.startsWith("#")) {
        const val = trimmed.slice("ELEVENLABS_API_KEY=".length).trim();
        if (val) return val.replace(/^["']|["']$/g, "");
      }
    }
  }
  // Fallback: try production local
  const prodPath = join(projectRoot, ".env.production.local");
  if (existsSync(prodPath)) {
    const content = readFileSync(prodPath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.includes("ELEVENLABS_API_KEY=") && !trimmed.startsWith("#")) {
        const val = trimmed.split("=").slice(1).join("=").trim();
        if (val) return val.replace(/^["']|["']$/g, "");
      }
    }
  }
  return "";
}

const API_BASE = "https://api.elevenlabs.io/v1";
const AGENT_ID = "agent_0601kkzcdcm5evk9mjhkxqd7dpjs";

const SYSTEM_PROMPT = `You are Isabel, a warm AI assistant for Vantage Stack. You speak like a late-20s South African woman from Sandton/Joburg — natural energy, friendly tone, light Joburg accent.

## Speaking style
- Use simple language. A 15-year-old must understand everything you say.
- Keep every reply to 2 sentences maximum. Never more.
- Natural energy — never monotone. Use tone changes.
- Light fillers: "cool", "awesome", "no worries", "yeah".
- Respond immediately after the user stops speaking. No delay.

## Opening line (always start with this exactly)
"Hi, I'm Isabel from Vantage Stack. What's your name?"

## Conversation flow
1. Get their name first. Use it naturally once or twice in the conversation.
2. Ask maximum 3 short questions to understand their situation.
3. After your 3rd question, say: "The free Growth Optimization Blueprint will show you exactly where you're losing money and how to fix it."
4. Then say: "It's completely free and only takes two minutes. Just scroll down on this page and fill in the quick form."

## Data capture (in this exact order)
1. Name — you already have it from the opening.
2. Email — ask for it, then spell it back to confirm. Say: "Just to confirm — your name is [Name], email is [email], right?"
3. Cell phone number.
4. WhatsApp — ask "Is your WhatsApp the same as your cell number?" If different, get it and confirm.
5. Preferred call time — "Morning or afternoon for the call?"

## After Blueprint is filled
Say: "Perfect! Someone from Vantage Stack will contact you straight away to go through the Blueprint with you. Shall we book that call for tomorrow morning or afternoon?"

## Knowledge base
- Use the knowledge base to answer anything about Vantage Stack, services, pricing, and the Growth Optimization Blueprint.
- Never make up information. If unsure, say so and direct them to the Blueprint form.

## Navigation links
- When referring to a page section, use markdown links: [Go to the Blueprint form](#blueprint), [See our services](#services), [Revenue System](#revenue-system)
- Say it naturally: "Let me take you there" then include the link.

## Important rules
- Maximum 2 sentences per reply. Always.
- Never sound like a robot. Sound warm, human, natural.
- Never use jargon or complicated words.`;

const FIRST_MESSAGE = "Hi, I'm Isabel from Vantage Stack. What's your name?";

async function apiFetch(path: string, method: string, body?: unknown) {
  const key = getApiKey();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": key,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("❌ ELEVENLABS_API_KEY not found in .env.local or .env.production.local");
    process.exit(1);
  }
  console.log("✅ API key found");

  // Step 1: Add website as URL knowledge base document
  console.log("\nStep 1: Adding website URL to knowledge base...");
  const urlKbRes = await apiFetch("/convai/knowledge-base/url", "POST", {
    url: "https://vantage-stack.vercel.app/",
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
    console.warn("  Continuing with text knowledge base only...");
  }

  // Step 2: Get current agent to see existing knowledge base docs
  console.log("\nStep 2: Fetching current agent config...");
  const getRes = await apiFetch(`/convai/agents/${AGENT_ID}`, "GET");
  if (!getRes.ok) {
    console.error("❌ Could not fetch agent:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const currentAgent = (await getRes.json()) as {
    conversation_config?: {
      agent?: {
        prompt?: {
          knowledge_base?: Array<{ type: string; name: string; id: string; usage_mode: string }>;
        };
      };
    };
  };

  const existingKb: Array<{ type: string; name: string; id: string; usage_mode: string }> =
    currentAgent?.conversation_config?.agent?.prompt?.knowledge_base || [];
  console.log("  Existing KB docs:", existingKb.length);

  // Build knowledge base array — keep existing, add new URL doc if we got one
  const knowledgeBase = [...existingKb];
  if (urlDocId) {
    // Avoid duplicates
    if (!knowledgeBase.find((k) => k.id === urlDocId)) {
      knowledgeBase.push({
        type: "url",
        name: "VantageStack Website",
        id: urlDocId,
        usage_mode: "auto",
      });
    }
  }

  // Step 3: Patch the agent
  console.log("\nStep 3: Updating Isabel agent...");
  const patchPayload = {
    conversation_config: {
      agent: {
        first_message: FIRST_MESSAGE,
        language: "en",
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

  const patchRes = await apiFetch(`/convai/agents/${AGENT_ID}`, "PATCH", patchPayload);
  if (!patchRes.ok) {
    const errText = await patchRes.text();
    console.error("❌ Agent update failed:", patchRes.status, errText);
    process.exit(1);
  }

  const patchData = (await patchRes.json()) as { agent_id?: string; name?: string };
  console.log("  ✅ Agent updated:", patchData.agent_id || AGENT_ID);
  console.log("\n✅ Done! Isabel is updated with:");
  console.log("   • New Joburg persona + 2-sentence rule");
  console.log("   • Sales flow: 3 questions → Blueprint pitch");
  console.log("   • Data capture: name → email → cell → WhatsApp → time slot");
  console.log("   • Speed: 1.15 | Stability: 25% | Variability: 80% | Style: 75%");
  if (urlDocId) console.log("   • Knowledge base: VantageStack website URL added");
}

main();
