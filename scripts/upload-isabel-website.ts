#!/usr/bin/env npx tsx
/**
 * Give Isabel the actual website content. Registers the live public pages as
 * URL knowledge-base docs on ElevenLabs and attaches them to the live agent
 * (usage_mode: auto), so she has the real site copy at her disposal — not just
 * the curated summary in content/isabel-knowledge-base.md.
 *
 * Idempotent: replaces same-named docs so re-runs don't pile up duplicates.
 * Outward-facing: this mutates the LIVE agent's knowledge base.
 *
 * Usage: npm run isabel:upload-website
 */

import { resolveElevenLabsApiKey, resolveIsabelAgentId } from "./isabel-env";

const API_BASE = "https://api.elevenlabs.io/v1";

// Public, indexable pages. Keep this list to real public routes only.
const PAGES: Array<{ name: string; url: string }> = [
  { name: "VantageStack Website — Home", url: "https://vantagestack.co.za/" },
  { name: "VantageStack Website — Blueprint", url: "https://vantagestack.co.za/blueprint" },
];

type KbDoc = { type: string; name: string; id: string; usage_mode: string };

async function main() {
  const apiKey = resolveElevenLabsApiKey();
  const agentId = resolveIsabelAgentId();
  if (!apiKey || !agentId) {
    console.error("Missing ELEVEN_LABS_API_KEY or NEXT_PUBLIC_ELEVENLABS_AGENT_ID");
    process.exit(1);
  }
  const headers = { "Content-Type": "application/json", "xi-api-key": apiKey };

  // 1. Create a URL KB doc per page.
  const fresh: KbDoc[] = [];
  for (const page of PAGES) {
    console.log(`Indexing ${page.url} …`);
    const res = await fetch(`${API_BASE}/convai/knowledge-base/url`, {
      method: "POST",
      headers,
      body: JSON.stringify({ url: page.url, name: page.name }),
    });
    if (!res.ok) {
      console.error(`  ⚠️ Failed to index ${page.url}:`, res.status, await res.text());
      continue;
    }
    const { id } = (await res.json()) as { id?: string };
    if (id) {
      fresh.push({ type: "url", name: page.name, id, usage_mode: "auto" });
      console.log("  doc id:", id);
    }
  }
  if (fresh.length === 0) {
    console.error("No pages indexed — aborting.");
    process.exit(1);
  }

  // 2. Fetch agent, replace same-named docs, attach, PATCH.
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
  const freshNames = new Set(fresh.map((d) => d.name));
  const knowledgeBase = [...existing.filter((k) => !freshNames.has(k?.name)), ...fresh];

  const patchRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      conversation_config: { agent: { prompt: { ...promptRest, knowledge_base: knowledgeBase } } },
    }),
  });
  if (!patchRes.ok) {
    console.error("PATCH agent failed:", patchRes.status, await patchRes.text());
    process.exit(1);
  }

  console.log(`✅ Website pages attached. Total KB docs now: ${knowledgeBase.length}`);
  console.log("   Docs:", knowledgeBase.map((k) => k.name).join(", "));
}

main();
