#!/usr/bin/env npx tsx
/**
 * Upload Isabel knowledge base to ElevenLabs.
 *
 * Usage:
 *   npm run isabel:upload-kb
 *
 * Requires ELEVENLABS_API_KEY in .env.local or your environment.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const API_BASE = "https://api.elevenlabs.io/v1";

// Resolve project root (parent of scripts/)
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

function getApiKey(): string {
  let apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (apiKey) return apiKey;
  // Fallback: read .env.local from project root
  const envPath = join(projectRoot, ".env.local");
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("ELEVENLABS_API_KEY=") && !trimmed.startsWith("ELEVENLABS_API_KEY=#")) {
        const val = trimmed.slice("ELEVENLABS_API_KEY=".length).trim();
        if (val) return val.replace(/^["']|["']$/g, "");
      }
    }
  }
  return "";
}

async function uploadKnowledgeBase() {
  const apiKey = getApiKey();
  if (!apiKey) {
    const envPath = join(projectRoot, ".env.local");
    console.error(
      "Error: ELEVENLABS_API_KEY is required. Set it in .env.local and run: npm run isabel:upload-kb"
    );
    console.error("Checked:", envPath, existsSync(envPath) ? "(exists)" : "(not found)");
    process.exit(1);
  }

  const kbPath = join(projectRoot, "content", "isabel-knowledge-base.md");
  let text: string;
  try {
    text = readFileSync(kbPath, "utf-8");
  } catch (err) {
    console.error(`Error: Could not read ${kbPath}`, err);
    process.exit(1);
  }

  const response = await fetch(`${API_BASE}/convai/knowledge-base/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
    },
    body: JSON.stringify({
      text,
      name: "VantageStack Site Knowledge",
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Error: ElevenLabs API returned ${response.status}`, err);
    process.exit(1);
  }

  const data = (await response.json()) as {
    id?: string;
    name?: string;
    folder_path?: string[];
  };

  console.log("Knowledge base document uploaded successfully.");
  console.log("Document ID:", data.id);
  console.log("Document name:", data.name);
  console.log("");
  console.log(
    "Next: In the ElevenLabs dashboard, add this document to your Isabel agent's knowledge base."
  );
}

uploadKnowledgeBase();
