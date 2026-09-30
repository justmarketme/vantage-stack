import type { SalesStage } from "./types";

/**
 * Every tunable for the Consultant Portal. Nothing numeric, textual or
 * environment-specific is inlined anywhere else — read it from here.
 * Server-only: reads secrets from process.env. Client code must not import it.
 */

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(env(name), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** CRM `clients.status` values must be plain slugs — they may be added to a Postgres enum. */
function statusSlug(name: string, fallback: string): string {
  const v = env(name, fallback);
  return /^[a-z][a-z-]{1,40}$/.test(v) ? v : fallback;
}

export function consultantConfig() {
  const publicUrl = (env("CONSULTANT_PUBLIC_URL") || env("NEXT_PUBLIC_APP_URL")).replace(/\/+$/, "");
  return {
    publicUrl,

    twilio: {
      accountSid: env("TWILIO_ACCOUNT_SID"),
      authToken: env("TWILIO_AUTH_TOKEN"),
      /** API key pair used ONLY to mint browser Voice access tokens. */
      apiKeySid: env("TWILIO_API_KEY_SID"),
      apiKeySecret: env("TWILIO_API_KEY_SECRET"),
      /** TwiML App whose Voice URL is `${publicUrl}/api/consultant-voice/twiml`. */
      twimlAppSid: env("TWILIO_TWIML_APP_SID"),
      /** Verified number clinics see on their caller ID. */
      callerId: env("CONSULTANT_CALLER_ID"),
      tokenTtlSec: envInt("CONSULTANT_VOICE_TOKEN_TTL_SEC", 3600),
      /** Max ring time before the dial gives up. */
      dialTimeoutSec: envInt("CONSULTANT_DIAL_TIMEOUT_SEC", 30),
      /** Hard cap on a single call. */
      maxCallSec: envInt("CONSULTANT_MAX_CALL_SEC", 3600),
      transcriptionLanguage: env("CONSULTANT_TRANSCRIPTION_LANGUAGE", "en-ZA"),
      /** Local development only. Never set in production. */
      skipSignature: env("CONSULTANT_TWILIO_SKIP_SIGNATURE") === "true" && process.env.NODE_ENV !== "production",
    },

    recording: {
      /**
       * Played to the clinic (only) when they answer, before the consultant is
       * connected. POPIA requires the other party to be told the call is recorded.
       */
      notice: env(
        "CONSULTANT_RECORDING_NOTICE",
        "Hi, this call from Vantage Stack is recorded for quality and training purposes.",
      ),
      noticeVoice: env("CONSULTANT_RECORDING_NOTICE_VOICE", "Polly.Joanna-Neural"),
    },

    ai: {
      apiKeyPresent: env("ANTHROPIC_API_KEY").length > 0,
      model: env("CONSULTANT_AI_MODEL", "claude-opus-5-5"),
      maxTokens: envInt("CONSULTANT_AI_MAX_TOKENS", 16000),
      /** Calls shorter than this (answered seconds) are not worth summarising. */
      minSummariseSec: envInt("CONSULTANT_MIN_SUMMARISE_SEC", 20),
      maxSummaryAttempts: envInt("CONSULTANT_MAX_SUMMARY_ATTEMPTS", 3),
    },

    live: {
      /** Browser poll interval for live transcript during a call. */
      pollMs: envInt("CONSULTANT_LIVE_POLL_MS", 1000),
    },

    pipeline: {
      /** CRM `clients.status` written when the portal creates a Clinics lead. */
      newLeadStatus: statusSlug("CONSULTANT_NEW_LEAD_STATUS", "lead"),
      /** CRM `clients.status` the lead moves to when its sales stage reaches these points. */
      statusOnProposal: statusSlug("CONSULTANT_STATUS_ON_PROPOSAL", "proposal-sent"),
      statusOnWon: statusSlug("CONSULTANT_STATUS_ON_WON", "active-client"),
      /** `deals.service_type` for a won Clinics deal. */
      dealServiceType: env("CONSULTANT_DEAL_SERVICE_TYPE", "clinic-ai-booking-agent"),
      /** Deal health: days without contact before a lead turns yellow / red. */
      healthYellowDays: envInt("CONSULTANT_HEALTH_YELLOW_DAYS", 3),
      healthRedDays: envInt("CONSULTANT_HEALTH_RED_DAYS", 7),
    },

    limits: {
      tokenPerMinute: envInt("CONSULTANT_TOKEN_RATE_PER_MIN", 10),
      callsPerMinute: envInt("CONSULTANT_CALLS_RATE_PER_MIN", 6),
      listMax: envInt("CONSULTANT_LIST_MAX", 500),
    },

    cronSecret: env("CRON_SECRET"),
  };
}

export type ConsultantConfig = ReturnType<typeof consultantConfig>;

/** Every CRM status value the portal may write (for enum safety in schema.ts). */
export function portalStatusValues(cfg: ConsultantConfig = consultantConfig()): string[] {
  return [cfg.pipeline.newLeadStatus, cfg.pipeline.statusOnProposal, cfg.pipeline.statusOnWon];
}

/** Maps a sales stage to the CRM status it implies, or null to leave status alone. */
export function crmStatusForStage(stage: SalesStage, cfg: ConsultantConfig = consultantConfig()): string | null {
  if (stage === "proposal") return cfg.pipeline.statusOnProposal;
  if (stage === "won") return cfg.pipeline.statusOnWon;
  return null;
}
