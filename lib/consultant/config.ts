import type { SalesStage } from "./types";

/**
 * Every tunable for the Consultant Portal. Nothing numeric, textual or
 * environment-specific is inlined anywhere else — read it from here.
 * Server-only: reads secrets from process.env. Client code must not import it.
 */

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function envFloat(name: string, fallback: number): number {
  const n = Number.parseFloat(env(name));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
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

    retention: {
      /** Twilio recordings older than this are deleted by the sweep. */
      recordingDays: envInt("CONSULTANT_RECORDING_RETENTION_DAYS", 90),
      /** Transcript segments older than this are deleted (summaries and notes stay). */
      transcriptDays: envInt("CONSULTANT_TRANSCRIPT_RETENTION_DAYS", 365),
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

    // ── Wave 2 ──────────────────────────────────────────────────────────────

    /** Localisation is fixed by decision: ZAR, SA +27 numbers, SAST. */
    locale: { currency: "ZAR" as const, timeZone: "Africa/Johannesburg" as const, language: "en-ZA" as const },

    commission: {
      /** 25% of the amount actually paid (frozen onto the deal at payment time). */
      rate: envFloat("CONSULTANT_COMMISSION_RATE", 0.25),
    },

    metrics: {
      /** An answered call counts as a "conversation" at or above this many seconds. */
      conversationMinSec: envInt("CONSULTANT_CONVERSATION_MIN_SEC", 120),
      /** Editable defaults for the calculator until real data exists. */
      defaultConnectRate: envFloat("CONSULTANT_DEFAULT_CONNECT_RATE", 0.3),
      defaultShowRate: envFloat("CONSULTANT_DEFAULT_SHOW_RATE", 0.75),
      defaultAvgSale: envInt("CONSULTANT_DEFAULT_AVG_SALE", 15000),
    },

    /**
     * Gamification DEFAULTS. The live values are editable in the app by the
     * Acquisition & Creative role and stored in `consultant_settings`
     * (key "gamification"); these only seed it. Placeholders until Jono sets them.
     */
    gamificationDefaults: {
      quarterTarget: envInt("CONSULTANT_QUARTER_TARGET", 225000),
      tier1: { label: "Monthly Achiever", monthlyRevenue: 30000, reward: "R500 Takealot voucher" },
      tier2: { label: "High Performer", monthlyRevenue: 75000, reward: "R1 500 Takealot voucher" },
      tier3: { label: "Quarter Top Performer", topN: 3, minQuarterRevenue: 150000, reward: "VantageStack branded apparel" },
      points: { dial: 1, connect: 2, meetingBooked: 10, meetingHeld: 15, proposal: 20, won: 40, paid: 100 },
      closeTargetFromConnects: envFloat("CONSULTANT_CLOSE_TARGET", 0.3),
    },

    /** Private Supabase Storage (Why Board images, proof of payment). Signed URLs only. */
    storage: {
      supabaseUrl: env("SUPABASE_URL"),
      serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
      bucket: env("CONSULTANT_STORAGE_BUCKET", "consultant-private"),
      maxBytes: envInt("CONSULTANT_UPLOAD_MAX_BYTES", 5 * 1024 * 1024),
      signedUrlTtlSec: envInt("CONSULTANT_SIGNED_URL_TTL_SEC", 600),
    },

    /** Supabase Realtime is used for NUDGES only ("something changed, refetch"), never data. */
    realtime: {
      supabaseUrl: env("NEXT_PUBLIC_SUPABASE_URL") || env("SUPABASE_URL"),
      anonKey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      serviceRoleKey: env("SUPABASE_SERVICE_ROLE_KEY"),
      channelPrefix: env("CONSULTANT_REALTIME_PREFIX", "vs-consultant"),
    },

    calendar: {
      google: { clientId: env("GOOGLE_CALENDAR_CLIENT_ID"), clientSecret: env("GOOGLE_CALENDAR_CLIENT_SECRET") },
      microsoft: {
        clientId: env("MS_CALENDAR_CLIENT_ID"),
        clientSecret: env("MS_CALENDAR_CLIENT_SECRET"),
        tenant: env("MS_CALENDAR_TENANT", "common"),
      },
      /** 32-byte key (base64) for AES-256-GCM encryption of stored OAuth tokens. */
      tokenEncKey: env("CONSULTANT_TOKEN_ENC_KEY"),
      maxSyncAttempts: envInt("CONSULTANT_CALENDAR_MAX_ATTEMPTS", 5),
    },

    emma: {
      /** The existing VantageStack WhatsApp sender (already used for Emma). */
      whatsappFrom: env("TWILIO_WHATSAPP_FROM"),
      smsFrom: env("CONSULTANT_CALLER_ID"),
      maxAttempts: envInt("EMMA_MAX_ATTEMPTS", 5),
      /** Retry backoff base; attempt n waits base × 2^(n-1), capped. */
      retryBaseSec: envInt("EMMA_RETRY_BASE_SEC", 30),
      retryMaxSec: envInt("EMMA_RETRY_MAX_SEC", 3600),
      /** Local development only. */
      dryRun: env("EMMA_DRY_RUN") === "true" && process.env.NODE_ENV !== "production",
    },

    n8n: {
      /** App → n8n: every platform event is POSTed here, signed. */
      eventsUrl: env("N8N_EVENTS_WEBHOOK_URL"),
      /** Shared HMAC secret for both directions (app ↔ n8n). */
      signingSecret: env("N8N_SIGNING_SECRET"),
      toleranceSec: envInt("N8N_SIGNATURE_TOLERANCE_SEC", 300),
    },

    /** Jono's personal EMMA assistant: receives business events, signed. */
    emmaOwner: {
      eventsUrl: env("EMMA_EVENTS_URL"),
      signingSecret: env("EMMA_EVENTS_SECRET"),
    },

    delivery: {
      maxAttempts: envInt("CONSULTANT_EVENT_MAX_ATTEMPTS", 8),
      retryBaseSec: envInt("CONSULTANT_EVENT_RETRY_BASE_SEC", 15),
      retryMaxSec: envInt("CONSULTANT_EVENT_RETRY_MAX_SEC", 3600),
      batchSize: envInt("CONSULTANT_EVENT_BATCH", 50),
    },

    seed: {
      /** Seeding refuses to run unless DATABASE_URL contains this marker (a staging branch ref). */
      allowedDbMarker: env("CONSULTANT_SEED_ALLOWED_DB_MARKER"),
    },
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
  if (stage === "won" || stage === "paid") return cfg.pipeline.statusOnWon;
  return null;
}
