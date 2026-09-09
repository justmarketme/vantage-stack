// Shared credential resolver for the Isabel agent scripts.
//
// Resolves the ElevenLabs API key and the agent id from the environment, with a
// fallback to reading .env.local / .env.production.local for scripts run via
// plain `npx tsx` (no --env-file). NEVER hardcode the agent id in a script —
// it must come from NEXT_PUBLIC_ELEVENLABS_AGENT_ID so every script targets the
// same live agent.

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readFromEnvFiles(keys: string[]): string {
  for (const file of [".env.local", ".env.production.local"]) {
    const path = join(projectRoot, file);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) continue;
      for (const key of keys) {
        if (trimmed.startsWith(`${key}=`)) {
          const val = trimmed.slice(key.length + 1).trim().replace(/^["']|["']$/g, "");
          if (val) return val;
        }
      }
    }
  }
  return "";
}

/** ElevenLabs API key — prefers ELEVEN_LABS_API_KEY, falls back to ELEVENLABS_API_KEY. */
export function resolveElevenLabsApiKey(): string {
  const fromEnv = (process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY || "").trim();
  return fromEnv || readFromEnvFiles(["ELEVEN_LABS_API_KEY", "ELEVENLABS_API_KEY"]);
}

/** The shared ConvAI agent id — always from NEXT_PUBLIC_ELEVENLABS_AGENT_ID. */
export function resolveIsabelAgentId(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "").trim();
  return fromEnv || readFromEnvFiles(["NEXT_PUBLIC_ELEVENLABS_AGENT_ID"]);
}
