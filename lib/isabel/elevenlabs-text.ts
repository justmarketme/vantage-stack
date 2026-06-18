/**
 * Drive the EXISTING Isabel ElevenLabs ConvAI agent in text mode over plain HTTP.
 *
 * Isabel's brain (system prompt + knowledge base) lives in the ElevenLabs
 * dashboard. We must NOT re-implement it — we call the agent's
 * simulate-conversation endpoint so replies are identical to the website widget.
 *
 * Why this endpoint (not the WebSocket): ConvAI's only live transport is a
 * streaming WebSocket, which does not work from Vercel's serverless runtime
 * (the socket opens, the init frame arrives, then no further frames are ever
 * delivered). simulate-conversation is a stateless HTTP call — ideal for a
 * webhook. We feed the user's real message as the final `user` turn in
 * `partial_conversation_history` (NOT via the simulated-user persona, which would
 * paraphrase it), cap generated turns to 1, and read the agent's reply. The
 * agent's dashboard prompt + KB are applied automatically.
 */

export type IsabelTurn = { role: "user" | "assistant"; content: string };

const API_BASE = "https://api.elevenlabs.io/v1";
/** How many prior turns to replay for continuity. */
const HISTORY_LIMIT = 12;
/** Abort a single HTTP attempt if the agent turn takes too long. Two attempts
 * (with backoff) must still fit comfortably under the route's 60s maxDuration. */
const REQUEST_TIMEOUT_MS = 18_000;
/** Total attempts (1 retry) — turns a transient ElevenLabs blip into a success
 * instead of a user-visible "technical hiccup" fallback. */
const MAX_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 400;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Transient errors worth retrying; deterministic ones (config/empty/4xx) are not. */
function isTransient(error: string): boolean {
  return (
    error === "timeout" ||
    error === "request_failed" ||
    error === "no_response" ||
    error === "http_429" ||
    /^http_5\d\d$/.test(error)
  );
}

function getConfig() {
  const agentId = (process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "").trim();
  const apiKey = (process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY || "").trim();
  return { agentId, apiKey };
}

type SimTurn = { role: "user" | "agent"; message: string; time_in_call_secs: number };

/** Map stored turns (+ the new user message) to the simulate-conversation history shape. */
function buildHistory(history: IsabelTurn[], message: string): SimTurn[] {
  const recent = history.slice(-HISTORY_LIMIT);
  const turns: SimTurn[] = recent.map((t, i) => ({
    role: t.role === "user" ? "user" : "agent",
    message: t.content,
    time_in_call_secs: i,
  }));
  turns.push({ role: "user", message, time_in_call_secs: turns.length });
  return turns;
}

export type AskIsabelResult = { ok: true; reply: string } | { ok: false; error: string };

/**
 * Send one user turn to Isabel and return her reply text.
 * `history` is the prior thread (oldest → newest), excluding the current message.
 */
export async function askIsabel(params: { message: string; history?: IsabelTurn[] }): Promise<AskIsabelResult> {
  const { agentId, apiKey } = getConfig();
  if (!agentId || !apiKey) return { ok: false, error: "elevenlabs_not_configured" };

  const message = (params.message || "").trim();
  if (!message) return { ok: false, error: "empty_message" };

  const history = buildHistory(params.history || [], message);

  let last: AskIsabelResult = { ok: false, error: "request_failed" };
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    last = await askOnce(agentId, apiKey, message, history);
    if (last.ok || !isTransient(last.error)) return last;
    if (attempt < MAX_ATTEMPTS) {
      console.warn(`[isabel] transient '${last.error}' on attempt ${attempt}/${MAX_ATTEMPTS}; retrying`);
      await sleep(RETRY_BACKOFF_MS);
    }
  }
  return last;
}

/** One simulate-conversation HTTP call. */
async function askOnce(
  agentId: string,
  apiKey: string,
  message: string,
  history: SimTurn[],
): Promise<AskIsabelResult> {
  const body = {
    new_turns_limit: 1,
    simulation_specification: {
      partial_conversation_history: history,
      // first_message is required by the schema; the agent actually replies to
      // the last user turn in the history above, so this just mirrors it.
      simulated_user_config: { first_message: message, language: "en" },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/convai/agents/${encodeURIComponent(agentId)}/simulate-conversation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      console.error(`[isabel] simulate-conversation ${res.status}: ${detail}`);
      return { ok: false, error: `http_${res.status}` };
    }

    const data = (await res.json()) as { simulated_conversation?: Array<{ role?: string; message?: string }> };
    const turns = data.simulated_conversation || [];
    // The reply is the last agent turn (we capped generation to 1 new turn).
    const reply = [...turns].reverse().find((t) => t.role === "agent")?.message?.trim();
    if (!reply) return { ok: false, error: "no_response" };
    return { ok: true, reply };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, error: aborted ? "timeout" : "request_failed" };
  } finally {
    clearTimeout(timer);
  }
}
