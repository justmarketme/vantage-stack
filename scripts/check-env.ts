import { config as loadDotenv } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Allows running without `--env-file` (Node) by loading `.env.local` if present.
// This is a dev helper only; production should use the platform's secret injection.
const _envPath = (() => {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url)); // .../scripts
  return path.join(scriptDir, "..", ".env.local");
})();

// Override even if variables exist but are empty. Some shells/launchers may inject empty env vars,
// which would otherwise prevent dotenv from setting the correct values.
loadDotenv({ path: _envPath, override: true });

// Only block on what the app needs to boot CRM + DB-backed routes. Integration keys are warned only.
const REQUIRED = ["DATABASE_URL", "SUPABASE_KEY"] as const;

// Used by research, email, SMS, Isabel, etc. — add when you use those features (see .env.example).
const RECOMMENDED = [
  "WHOIS_API_KEY",
  "PAGESPEED_API_KEY",
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

const legacyEleven = isSet("ELEVENLABS_API_KEY");
const missingRecommended = RECOMMENDED.filter((k) => (k === "ELEVEN_LABS_API_KEY" ? !isSet(k) && !legacyEleven : !isSet(k)));

if (missing.length) {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Missing required environment variables:",
      ...missing.map((m) => `- ${m}`),
      "",
      "Create `.env.local` (never commit it) or inject via your platform secrets.",
      "Template: `.env.example`",
    ].join("\n"),
  );
  process.exit(1);
}

if (missingRecommended.length) {
  // eslint-disable-next-line no-console
  console.warn(
    [
      "",
      "Optional integrations not configured (app will run; related features may fail):",
      ...missingRecommended.map((m) => `- ${m}`),
      "",
      "Add to `.env.local` when you need research, Resend, Twilio, ElevenLabs, Apify, etc.",
      "",
    ].join("\n"),
  );
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
