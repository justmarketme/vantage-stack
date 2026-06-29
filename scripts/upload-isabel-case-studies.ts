#!/usr/bin/env npx tsx
/**
 * Upload content/case-studies.md to ElevenLabs as a knowledge-base text doc AND
 * attach it to the live Isabel agent (usage_mode: auto). Idempotent: replaces a
 * previously-attached doc of the same name so re-runs don't pile up duplicates.
 *
 * Outward-facing: this mutates the LIVE agent's knowledge base.
 *
 * Usage: npm run isabel:upload-case-studies
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC_NAME = "VantageStack Case Studies";

type KbDoc = { type: string; name: string; id: string; usage_mode: string };

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const agentId = resolveIsabelAgentId();
  if (!apiKey || !agentId) {
    console.error("Missing ELEVEN_LABS_API_KEY or NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    process.exit(1);
  }

  const text = readFileSync(join(projectRoot, "content", "case-studies.md"), "utf-8");

  // 1. Upload the case studies as a text KB document.
  console.log("Uploading case studies to the knowledge base…");
  const upRes = await fetch(`${API_BASE}/convai/knowledge-base/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({ text, name: DOC_NAME }),
  });
  if (!upRes.ok) {
    console.error("Upload failed:", upRes.status, await upRes.text());
    process.exit(1);
  }
  const { id: docId } = (await upRes.json()) as { id?: string };
  if (!docId) {
    console.error("No document id returned from upload");
    process.exit(1);
  }
  console.log("  Uploaded doc id:", docId);

  // 2. Fetch the agent, replace any same-named doc, re-attach, PATCH.
  const getRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
  if (!getRes.ok) {
    console.error("GET agent failed:", getRes.status, await getRes.text());
    process.exit(1);
  }
  const current = (await getRes.json()) as {
    conversation_config?: { agent?: { prompt?: Record<string, unknown> } };
  };
  const prompt = (current.conversation_config?.agent?.prompt ?? {}) as Record<string, unknown>;
  const { tools: _tools, ...promptRest } = prompt; // API rejects `tools` on PATCH
  const existing = Array.isArray(prompt.knowledge_base) ? (prompt.knowledge_base as KbDoc[]) : [];
  const knowledgeBase = existing.filter((k) => k?.name !== DOC_NAME);
  knowledgeBase.push({ type: "text", name: DOC_NAME, id: docId, usage_mode: "auto" });

  const patchRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
    body: JSON.stringify({
      conversation_config: { agent: { prompt: { ...promptRest, knowledge_base: knowledgeBase } } },
    }),
  });
  if (!patchRes.ok) {
    console.error("PATCH agent failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }

  console.log(`✅ Case studies attached to Isabel. Total KB docs now: ${knowledgeBase.length}`);
  console.log("   Docs:", knowledgeBase.map((k) => k.name).join(", "));
}

main();
