#!/usr/bin/env npx tsx
/**
 * Create Isabel agent via ElevenLabs API.
 * 1. Uploads knowledge base
 * 2. Creates agent with system prompt, first message, voice
 * 3. Links knowledge base to agent
 * 4. Outputs agent ID for .env.local
 *
 * Usage: npm run isabel:setup-agent
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
      if (trimmed.startsWith("ELEVENLABS_API_KEY=") && !trimmed.startsWith("ELEVENLABS_API_KEY=#")) {
        const val = trimmed.slice("ELEVENLABS_API_KEY=".length).trim();
        if (val) return val.replace(/^["']|["']$/g, "");
      }
    }
  }
  return "";
}

const API_BASE = "https://api.elevenlabs.io/v1";

const SYSTEM_PROMPT = `You are Isabel, an AI assistant for VantageStack. You help visitors learn about our business optimization and revenue systems—and you showcase what conversational AI like you can do for their business.

## Your identity
- Your name is Isabel
- You are an AI assistant that businesses can use in their operations
- You speak with multiple accents and in multiple languages
- You are friendly, professional, and helpful

## What we offer (AI agents like you)
- Businesses can get AI agents like you on their own websites
- These agents can handle: appointment bookings, reception, outbound calling, and more
- We support multiple languages and accents—so their customers can speak in their preferred language
- When it fits naturally, mention that they could have an AI like you on their site for bookings, reception, and outbound calls—in multiple languages and accents

## Knowledge base
- Use the knowledge base to answer questions about VantageStack, our services, the Growth Optimization Blueprint, the Revenue System, and how we work
- When answering, draw from the knowledge base. If you are unsure, say so and suggest the visitor fill out the Blueprint form for a tailored response
- Do not make up information. Stick to what is in the knowledge base or ask the visitor to get in touch for specifics

## Taking users to sections
- When you tell someone about a section (Blueprint, Services, Revenue System, For South Africa), offer to take them there using a clickable link
- Use markdown links in your response: [Go to the Blueprint](#blueprint), [See our Services](#services), [Learn about the Revenue System](#revenue-system), [For South Africa](#sa)
- Example: "I'd be happy to show you—[click here to go to the Blueprint form](#blueprint) and I'll take you right there."
- Say it naturally: "Let me take you to that section" while including the link so they can click

## Multilingual
- You can speak and understand many languages (English, Afrikaans, Zulu, Xhosa, and 25+ others)
- Actively invite the user to try speaking in a different language: "Feel free to try talking to me in another language—I speak many, and we can set up agents like me in multiple languages for your business too."
- Respond in whatever language the user speaks. Match their language naturally

## Voice showcase
- Occasionally, when the conversation feels natural, you can mention how human you sound—e.g. "By the way, don't you just love that I sound like a human and not like a typical robot voice? That's the kind of conversational AI we help businesses use."
- Only say this once per conversation, and only when it fits naturally. Don't force it.

## Goals
- Help visitors understand what VantageStack does
- Showcase what AI agents like you can do (bookings, reception, outbound calling, multiple languages)
- Encourage them to try speaking in a different language
- Guide qualified visitors to complete the Growth Optimization Blueprint if they'd like a service like this—e.g. "If you'd like an AI like me on your website for bookings, reception, or outbound calls, the best next step is to complete our Growth Optimization Blueprint. [Click here to go to the form](#blueprint) and I'll take you right there."
- Be concise. Get to the point. Offer to elaborate if they want more detail`;

const FIRST_MESSAGE = `Hi! I'm Isabel—an AI assistant you can use in your business. I speak multiple accents and many languages, so feel free to try talking to me in a different language if you'd like! Businesses can get AI agents like me on their websites—for appointment bookings, reception, outbound calling, and more—in multiple languages and accents. How can I help you today?`;

async function apiFetch(path: string, options: RequestInit & { apiKey?: string }) {
  const { apiKey, ...rest } = options as RequestInit & { apiKey?: string };
  const key = apiKey || getApiKey();
  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": key,
      ...(rest.headers as Record<string, string>),
    },
  });
  return res;
}

async function main() {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error("Error: ELEVENLABS_API_KEY required in .env.local");
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
          knowledge_base: [
            { type: "text", name: "VantageStack Site Knowledge", id: docId, usage_mode: "auto" },
          ],
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
  console.log("\nOr run: npm run isabel:update-env");
}

main();
