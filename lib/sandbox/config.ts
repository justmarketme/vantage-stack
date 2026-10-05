/**
 * Demo-sandbox configuration.
 *
 * THE POINT OF THIS FILE: the sandbox must never spend production credits.
 *
 * That guarantee cannot be made by a toggle in the UI — a widget pointed at the
 * production agent consumes production minutes no matter what the surrounding
 * page says. It can only be made by pointing at a SEPARATE agent, funded
 * separately. So this module resolves sandbox-only identifiers and, when they
 * are absent, reports `ready: false` and the reason.
 *
 * It deliberately does NOT fall back to the production agent. A silent fallback
 * would look like it worked while doing exactly the thing the sandbox exists to
 * prevent, and nobody would notice until the bill.
 */

export type ProviderStatus =
  | { ready: true; agentId: string }
  | { ready: false; reason: string; envVar: string };

/**
 * ElevenLabs ConvAI — sandbox agent.
 *
 * Create a second agent in the ElevenLabs dashboard (clone the production one),
 * then set NEXT_PUBLIC_ELEVENLABS_SANDBOX_AGENT_ID. Keeping it NEXT_PUBLIC_ is
 * correct: ConvAI agent IDs are public by design, the browser must hold one to
 * open a session, and access is controlled by the agent's own allowlist rather
 * than by secrecy.
 */
export function elevenLabsSandbox(): ProviderStatus {
  const sandbox = (process.env.NEXT_PUBLIC_ELEVENLABS_SANDBOX_AGENT_ID || "").trim();
  const production = (process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "").trim();

  if (!sandbox) {
    return {
      ready: false,
      envVar: "NEXT_PUBLIC_ELEVENLABS_SANDBOX_AGENT_ID",
      reason:
        "No sandbox agent configured. Clone the production agent in ElevenLabs and set this variable — the sandbox will not fall back to production.",
    };
  }

  // Guard against the most likely misconfiguration: pasting the production id
  // into the sandbox variable, which would defeat the entire purpose.
  if (production && sandbox === production) {
    return {
      ready: false,
      envVar: "NEXT_PUBLIC_ELEVENLABS_SANDBOX_AGENT_ID",
      reason:
        "The sandbox agent id is identical to the production agent id. Sessions would bill production minutes. Point it at a separate agent.",
    };
  }

  return { ready: true, agentId: sandbox };
}

/**
 * Ultravox.
 *
 * STATUS AS OF THIS BUILD: `ultravox-client` is a declared dependency but there
 * is no Ultravox code, no API route and no credentials anywhere in the repo. It
 * is an unwired package, not a working integration.
 *
 * Rather than ship a panel that mimics a connection it cannot make, this
 * reports honestly and tells whoever opens the sandbox exactly what is missing.
 * A demo that silently does nothing is worse than one that says why.
 */
export function ultravoxSandbox(): ProviderStatus {
  const key = (process.env.ULTRAVOX_SANDBOX_CONFIGURED || "").trim();
  if (!key) {
    return {
      ready: false,
      envVar: "ULTRAVOX_SANDBOX_CONFIGURED",
      reason:
        "Ultravox is not integrated yet. `ultravox-client` is installed but nothing uses it, and no API key or server route exists. Wiring it needs an Ultravox key held server-side plus a token endpoint — the browser must never hold the key.",
    };
  }
  return { ready: true, agentId: "ultravox" };
}

/**
 * Demo personas. These are the "custom personas" a consultant picks before a
 * live demo, so the agent speaks as the right business rather than as Vantage
 * Stack generically.
 *
 * Kept as data, not prose, so adding a vertical is one object.
 */
export type DemoPersona = {
  id: string;
  label: string;
  /** Shown on the card so the operator knows what they are about to demo. */
  blurb: string;
  /** Prompt override sent to the sandbox agent. */
  prompt: string;
  firstMessage: string;
};

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: "aesthetic",
    label: "Aesthetic clinic",
    blurb: "Med-spa / aesthetic clinic reception. Books consultations and treatments, never gives medical advice.",
    prompt:
      "You are the receptionist for a private aesthetic clinic in South Africa (injectables, skin treatments, laser). Your job is to book, move and confirm consultations and treatments, answer questions about hours, location, parking and which treatments the clinic offers, and take a WhatsApp number for the booking confirmation. You NEVER give medical advice, never say whether a treatment is suitable or safe for someone, and never promise results — that is for the practitioner at the consultation. Do not ask for medical history on the phone. If asked about prices you were not given, say the practitioner confirms the quote at the consultation, and offer the earliest slot. Warm, polished, South African. Keep replies short.",
    firstMessage: "Good afternoon, thanks for calling — how can I help you today?",
  },
  {
    id: "clinic",
    label: "Dental practice",
    blurb: "Dental / aesthetic practice reception. Books appointments, never gives clinical advice.",
    prompt:
      "You are the receptionist for a private dental practice in Cape Town. Your job is to book, move and confirm appointments and answer questions about hours, location and parking. You NEVER give clinical, dental or medical advice of any kind — if asked about symptoms, pain, treatment or whether someone needs care, you say that is for the dentist and offer the earliest appointment. Warm, efficient, South African. Keep replies short.",
    firstMessage: "Good afternoon, thanks for calling the practice — how can I help?",
  },
  {
    id: "property",
    label: "Estate agency",
    blurb: "Qualifies buyers and books viewings against an agent's diary.",
    prompt:
      "You are the front desk for a South African estate agency. Qualify the caller — buying or selling, area, budget, timeline — then book a viewing or a valuation. Never quote a property price you were not given and never give financial or legal advice. Friendly, brisk, South African.",
    firstMessage: "Afternoon! Are you looking to buy, or to sell?",
  },
  {
    id: "trades",
    label: "Trades / home services",
    blurb: "Captures the job, the address and the urgency, then books a site visit.",
    prompt:
      "You answer the phone for a plumbing and maintenance business. Find out what the problem is, how urgent it is, and where they are, then book a site visit. If it sounds like an emergency — burst pipe, no water, sewage — flag it as urgent and offer the soonest slot. Never quote a fixed price; give a call-out fee only if asked and say the rest depends on the job. Practical, calm, South African.",
    firstMessage: "Hi, you've reached the workshop — what's the problem?",
  },
];

/** Dynamic values injected into the persona so a demo can carry the prospect's own details. */
export type DemoVariables = {
  businessName: string;
  city: string;
  callerName: string;
};

export const DEFAULT_VARIABLES: DemoVariables = {
  businessName: "Glow Aesthetics",
  city: "Cape Town",
  callerName: "Thabo",
};

/**
 * Builds the final prompt. Substitution is done here rather than relying on the
 * provider's own templating so the operator can see the exact text that will be
 * sent before starting a session.
 */
export function buildPrompt(persona: DemoPersona, vars: DemoVariables): string {
  return [
    persona.prompt,
    "",
    "## THIS DEMO",
    `Business name: ${vars.businessName || "—"}`,
    `City: ${vars.city || "—"}`,
    `Caller's name: ${vars.callerName || "—"}`,
    "",
    "This is a demonstration. If asked directly whether you are a real person, say you are an AI assistant.",
  ].join("\n");
}
