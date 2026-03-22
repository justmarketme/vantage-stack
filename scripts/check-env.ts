import { config as loadDotenv } from "dotenv";
import { existsSync } from "fs";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Allows running without `--env-file` (Node) by loading `.env.local` if present.
// This is a dev helper only; production should use the platform's secret injection.
const _beforeCwd = process.cwd();
const _envPath = (() => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url)); // .../scripts
  return path.join(scriptDir, "..", ".env.local");
})();
const _beforeEnvExists = existsSync(_envPath);
const _beforeDatabaseUrl = process.env.DATABASE_URL;
const _beforeSupabaseKey = process.env.SUPABASE_KEY;

// #region agent log H3 envfile+cdir
fetch("http://127.0.0.1:7940/ingest/6c677ec0-0cba-4762-aa2d-dc2b04124703", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "97aca1" },
  body: JSON.stringify({
    sessionId: "97aca1",
    location: "scripts/check-env.ts:pre-dotenv",
    message: "Check cwd and whether .env.local exists",
    hypothesisId: "H3",
    data: { cwd: _beforeCwd, envLocalExists: _beforeEnvExists },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

// Override even if variables exist but are empty. Some shells/launchers may inject empty env vars,
// which would otherwise prevent dotenv from setting the correct values.
loadDotenv({ path: _envPath, override: true });

function formatEnvSig(v: string | undefined) {
  const s = (v ?? "").trim();
  if (!s) return "empty";
  if (/^postgres(ql)?:\/\//i.test(s)) return "postgres-url";
  if (/^https?:\/\//i.test(s)) return "http-url";
  if (s.startsWith("sb_")) return "sb-public-key";
  return "other";
}

function appendLocalDebug(line: Record<string, unknown>) {
  try {
    const logPath = path.join(process.cwd(), "debug-97aca1.log");
    fs.appendFileSync(logPath, JSON.stringify(line) + "\n", "utf8");
  } catch {
    // ignore logging failures; env-check should still work.
  }
}

function envKeyState(key: string) {
  const has = Object.prototype.hasOwnProperty.call(process.env, key);
  const v = (process.env[key] ?? "").trim();
  return { has, valueSig: formatEnvSig(process.env[key]), trimmedLen: v.length };
}

// #region agent log H1 before DATABASE_URL signature
fetch("http://127.0.0.1:7940/ingest/6c677ec0-0cba-4762-aa2d-dc2b04124703", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "97aca1" },
  body: JSON.stringify({
    sessionId: "97aca1",
    location: "scripts/check-env.ts:before-env",
    message: "DATABASE_URL/SUPABASE_KEY signature before dotenv load",
    hypothesisId: "H1",
    data: { DATABASE_URL: formatEnvSig(_beforeDatabaseUrl), SUPABASE_KEY: formatEnvSig(_beforeSupabaseKey) },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

// #region agent log H1 local append
appendLocalDebug({
  sessionId: "97aca1",
  location: "scripts/check-env.ts:before-env-sig",
  hypothesisId: "H1",
  message: "Env signature before dotenv load",
  data: {
    DATABASE_URL: formatEnvSig(_beforeDatabaseUrl),
    SUPABASE_KEY: formatEnvSig(_beforeSupabaseKey),
    DATABASE_URL_keyState: envKeyState("DATABASE_URL"),
    SUPABASE_KEY_keyState: envKeyState("SUPABASE_KEY"),
  },
  timestamp: Date.now(),
  // no secrets
});
// #endregion

// Telegram is optional at bootstrap: dev/start can run without it. Add TELEGRAM_BOT_TOKEN when you
// use the telegram-orchestrator, morning briefing, delivery alerts, etc. (BotFather token is free.)
const REQUIRED = [
  "DATABASE_URL",
  "SUPABASE_KEY",
  "WHOIS_API_KEY",
  "PAGESPEED_API_KEY",
  // Accept either new or legacy naming for ElevenLabs.
  "ELEVEN_LABS_API_KEY",
  "RESEND_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "APIFY_TOKEN",
] as const;

function isSet(name: string): boolean {
  const v = (process.env[name] ?? "").trim();
  return v.length > 0;
}

const missing = REQUIRED.filter((k) => !isSet(k));

// Back-compat: if legacy key is set, consider ELEVEN_LABS_API_KEY satisfied.
const legacyEleven = isSet("ELEVENLABS_API_KEY");
const missingNormalized = missing.filter((k) => (k === "ELEVEN_LABS_API_KEY" ? !legacyEleven : true));

// #region agent log H2 after dotenv load check
fetch("http://127.0.0.1:7940/ingest/6c677ec0-0cba-4762-aa2d-dc2b04124703", {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "97aca1" },
  body: JSON.stringify({
    sessionId: "97aca1",
    location: "scripts/check-env.ts:after-env",
    message: "DATABASE_URL/SUPABASE_KEY signature after dotenv load (override:false)",
    hypothesisId: "H2",
    data: {
      DATABASE_URL: formatEnvSig(process.env.DATABASE_URL),
      SUPABASE_KEY: formatEnvSig(process.env.SUPABASE_KEY),
      changedFromBefore: (process.env.DATABASE_URL ?? "") !== (_beforeDatabaseUrl ?? ""),
    },
    timestamp: Date.now(),
  }),
}).catch(() => {});
// #endregion

// #region agent log H2 local append
appendLocalDebug({
  sessionId: "97aca1",
  location: "scripts/check-env.ts:after-env-sig",
  hypothesisId: "H2",
  message: "Env signature after dotenv load (override:false)",
  data: {
    DATABASE_URL: formatEnvSig(process.env.DATABASE_URL),
    SUPABASE_KEY: formatEnvSig(process.env.SUPABASE_KEY),
    DATABASE_URL_keyState: envKeyState("DATABASE_URL"),
    SUPABASE_KEY_keyState: envKeyState("SUPABASE_KEY"),
  },
  changedFromBefore: (process.env.DATABASE_URL ?? "") !== (_beforeDatabaseUrl ?? ""),
  timestamp: Date.now(),
});
// #endregion

if (missingNormalized.length) {
  // Keep output concise; CI/dev should fail fast.
  // eslint-disable-next-line no-console
  console.error(
    [
      "Missing required environment variables:",
      ...missingNormalized.map((m) => `- ${m}`),
      "",
      "Create `.env.local` (never commit it) or inject via your platform secrets.",
      "Template: `.env.example`",
    ].join("\n"),
  );
  process.exit(1);
}

if (!isSet("TELEGRAM_BOT_TOKEN")) {
  // eslint-disable-next-line no-console
  console.warn(
    [
      "",
      "Note: TELEGRAM_BOT_TOKEN is not set. `npm run dev` / core app work, but Telegram bot,",
      "briefing/cron Telegram steps, and related MCPs need a token from @BotFather when you enable them.",
      "Add it to `.env.local` or use Add API Key.bat → 6.",
      "",
    ].join("\n"),
  );
}
