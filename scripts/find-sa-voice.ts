#!/usr/bin/env npx tsx
/**
 * Discovery helper: prints Isabel's CURRENT agent TTS config, and lists the best
 * South African female voices from the ElevenLabs shared voice library so we can
 * pick the most natural one. Read-only — changes nothing.
 *
 * Usage: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/find-sa-voice.ts
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
  const headers = { "xi-api-key": apiKey };

  // 1. Current agent TTS config
  const getRes = await fetch(`${API_BASE}/convai/agents/${agentId}`, { headers });
  if (getRes.ok) {
    const a = (await getRes.json()) as { conversation_config?: { tts?: Record<string, unknown> } };
    console.log("── CURRENT agent TTS ─────────────────────────────");
    console.log(JSON.stringify(a.conversation_config?.tts ?? {}, null, 2));
  } else {
    console.warn("Could not GET agent:", getRes.status, await getRes.text());
  }

  // 2. Search the shared library for South African female voices.
  console.log("\n── SOUTH AFRICAN female voices in the library ────");
  const params = new URLSearchParams({ gender: "female", page_size: "100", search: "south african" });
  const res = await fetch(`${API_BASE}/shared-voices?${params.toString()}`, { headers });
  if (!res.ok) {
    console.error("shared-voices failed:", res.status, await res.text());
    process.exit(1);
  }
  const data = (await res.json()) as {
    voices?: Array<{
      voice_id: string;
      public_owner_id?: string;
      name: string;
      accent?: string;
      description?: string;
      use_case?: string;
      language?: string;
      cloned_by_count?: number;
      preview_url?: string;
      verified_languages?: Array<{ language?: string; accent?: string }>;
    }>;
  };

  const isSA = (v: { accent?: string; description?: string; verified_languages?: Array<{ accent?: string }> }) => {
    const hay = `${v.accent ?? ""} ${v.description ?? ""} ${(v.verified_languages ?? []).map((l) => l.accent).join(" ")}`.toLowerCase();
    return hay.includes("south afric") || hay.includes("afrikaans");
  };

  const sa = (data.voices ?? []).filter(isSA).sort((a, b) => (b.cloned_by_count ?? 0) - (a.cloned_by_count ?? 0));
  if (sa.length === 0) {
    console.log("No explicit South African matches; showing top female 'african' results instead.");
  }
  for (const v of (sa.length ? sa : (data.voices ?? [])).slice(0, 12)) {
    console.log(
      `\n• ${v.name}  [${v.voice_id}]  owner=${v.public_owner_id ?? "-"}\n  accent=${v.accent ?? "-"} | use=${v.use_case ?? "-"} | cloned=${v.cloned_by_count ?? 0}\n  ${(v.description ?? "").slice(0, 140)}\n  preview: ${v.preview_url ?? "-"}`,
    );
  }
}

main();
