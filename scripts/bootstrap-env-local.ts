import fs from "fs";
import readline from "readline";
import path from "path";
import { fileURLToPath } from "url";
import { config as loadDotenv } from "dotenv";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(scriptDir, "..");
const envPath = path.join(repoRoot, ".env.local");

const REQUIRED = [
  "DATABASE_URL",
  "SUPABASE_KEY",
  "WHOIS_API_KEY",
  "PAGESPEED_API_KEY",
  "RESEND_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "APIFY_TOKEN",
  // Back-compat: code checks either ELEVEN_LABS_API_KEY (required) or legacy ELEVENLABS_API_KEY.
  "ELEVEN_LABS_API_KEY",
] as const;

function isNonEmpty(v: string | undefined) {
  return (v ?? "").trim().length > 0;
}

function readEnvFileText() {
  if (!fs.existsSync(envPath)) return "";
  return fs.readFileSync(envPath, "utf8");
}

function getKeyValueFromText(text: string, key: string) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  return m ? String(m[1]).trim() : "";
}

function escapeForDoubleQuotes(v: string) {
  // Keep it simple: just escape double quotes and normalize newlines.
  return v.replaceAll("\r", "").replaceAll("\n", "\\n").replaceAll('"', '\\"');
}

function upsertKeyLine(text: string, key: string, value: string) {
  const line = `${key}="${escapeForDoubleQuotes(value)}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) {
    return text.replace(re, line);
  }
  // Append near the end (keeps existing ordering/comments intact).
  const suffix = text.endsWith("\n") ? "" : "\n";
  return text + suffix + line + "\n";
}

async function ask(question: string) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return await new Promise<string>((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const currentText = readEnvFileText();

  // Load also from dotenv so we can recognize values already set via environment.
  loadDotenv({ path: envPath, override: true });

  const missing: string[] = [];
  for (const k of REQUIRED) {
    const fromEnv = process.env[k];
    const fromFile = getKeyValueFromText(currentText, k);
    const val = isNonEmpty(fromEnv) ? fromEnv : fromFile;
    if (!isNonEmpty(val)) missing.push(k);
  }

  // Legacy key support: if user provided ELEVENLABS_API_KEY but not ELEVEN_LABS_API_KEY, copy it.
  const legacyEleven = process.env["ELEVENLABS_API_KEY"];
  const typedEleven = process.env["ELEVEN_LABS_API_KEY"];
  const fileLegacyEleven = getKeyValueFromText(currentText, "ELEVENLABS_API_KEY");
  const fileTypedEleven = getKeyValueFromText(currentText, "ELEVEN_LABS_API_KEY");
  if (!isNonEmpty(typedEleven) && isNonEmpty(legacyEleven)) {
    // handled by writing below when missing includes ELEVEN_LABS_API_KEY
  } else if (!isNonEmpty(fileTypedEleven) && isNonEmpty(fileLegacyEleven)) {
    // handled by writing below when missing includes ELEVEN_LABS_API_KEY
  }

  if (missing.length === 0) {
    console.log("All required env vars are present in .env.local (or process env).");
    return;
  }

  let nextText = currentText;
  for (const key of missing) {
    // Never print the entered value back.
    const promptKey = key === "ELEVEN_LABS_API_KEY" ? "ELEVEN_LABS_API_KEY (or ELEVENLABS_API_KEY)" : key;
    const answer = await ask(`Enter value for ${promptKey}: `);
    if (!isNonEmpty(answer)) {
      console.log(`Skipped ${key} (empty).`);
      continue;
    }
    nextText = upsertKeyLine(nextText, key, answer);
  }

  fs.writeFileSync(envPath, nextText, "utf8");
  console.log(`Wrote updated env to ${envPath}`);

  // Re-validate using dotenv parsing (no secrets printed).
  const reloaded: Record<string, boolean> = {};
  loadDotenv({ path: envPath, override: true });
  for (const k of REQUIRED) reloaded[k] = isNonEmpty(process.env[k]);

  const stillMissing = Object.entries(reloaded).filter(([, ok]) => !ok).map(([k]) => k);
  if (stillMissing.length) {
    console.log("Still missing after write:");
    for (const k of stillMissing) console.log(`- ${k}`);
    process.exit(1);
  }

  console.log("Success: required env vars are now present.");
}

main().catch((err) => {
  console.error(err?.message ?? String(err));
  process.exit(1);
});

