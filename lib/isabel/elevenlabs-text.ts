import WebSocket from "ws";

/**
 * Drive the EXISTING Isabel ElevenLabs ConvAI agent in text-only mode.
 *
 * Isabel's brain (system prompt + knowledge base) lives in the ElevenLabs
 * dashboard. We must NOT re-implement it — we open a `text_only` WebSocket to
 * the same agent so replies are identical to the website widget.
 *
 * ConvAI has no stateless "send text / get reply" REST endpoint and no
 * resume-by-conversation_id. So for each inbound WhatsApp message we:
 *   1. open a fresh socket,
 *   2. send `conversation_initiation_client_data` with ONLY
 *      `{ conversation: { text_only: true } }` (no prompt override → identical
 *      persona/KB to the widget),
 *   3. re-seed the recent thread as a single `contextual_update` so Isabel has
 *      continuity,
 *   4. send the new turn as `user_message`,
 *   5. return the final `agent_response` text.
 */

export type IsabelTurn = { role: "user" | "assistant"; content: string };

const WS_BASE = "wss://api.elevenlabs.io/v1/convai/conversation";
const SIGNED_URL_ENDPOINT = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

/** How many prior turns to replay for continuity. */
const HISTORY_LIMIT = 12;
/** Hard ceiling so a hung socket can't stall the Twilio webhook. */
const REPLY_TIMEOUT_MS = 13_000;

function getConfig() {
  const agentId = (process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || "").trim();
  const apiKey = (process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY || "").trim();
  return { agentId, apiKey };
}

/** Fetch a short-lived signed URL (works for private agents; harmless for public). */
async function getSignedUrl(agentId: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${SIGNED_URL_ENDPOINT}?agent_id=${encodeURIComponent(agentId)}`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { signed_url?: string };
    return data.signed_url || null;
  } catch {
    return null;
  }
}

function buildHistoryContext(history: IsabelTurn[]): string | null {
  const recent = history.slice(-HISTORY_LIMIT);
  if (recent.length === 0) return null;
  const lines = recent.map((t) => `${t.role === "user" ? "User" : "Isabel"}: ${t.content}`);
  return [
    "This is an ongoing WhatsApp conversation. Earlier messages, for your context (do not repeat them verbatim):",
    ...lines,
  ].join("\n");
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

  const signed = await getSignedUrl(agentId, apiKey);
  const url = signed || `${WS_BASE}?agent_id=${encodeURIComponent(agentId)}`;

  const historyContext = buildHistoryContext(params.history || []);

  return new Promise<AskIsabelResult>((resolve) => {
    let settled = false;
    let ws: WebSocket | null = null;

    const finish = (result: AskIsabelResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, error: "timeout" }), REPLY_TIMEOUT_MS);

    try {
      ws = new WebSocket(url, signed ? undefined : { headers: { "xi-api-key": apiKey } });
    } catch {
      finish({ ok: false, error: "ws_construct_failed" });
      return;
    }

    ws.on("open", () => {
      // Minimal override → keep the dashboard prompt + KB exactly as the widget uses them.
      ws!.send(
        JSON.stringify({
          type: "conversation_initiation_client_data",
          conversation_config_override: { conversation: { text_only: true } },
        }),
      );
    });

    let initialised = false;
    // In chat mode the agent emits its greeting (first_message) as the first
    // `agent_response`, then the reply to our turn as the next one. Collect them
    // and return the reply, not the greeting.
    const responses: string[] = [];
    // Backstop: if a greeting arrives but no follow-up reply does, return the
    // greeting rather than hanging until the hard timeout.
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const finishWithBest = () => {
      if (responses.length >= 2) finish({ ok: true, reply: responses[1] });
      else if (responses.length === 1) finish({ ok: true, reply: responses[0] });
      else finish({ ok: false, error: "no_response" });
    };

    ws.on("message", (raw: WebSocket.RawData) => {
      let evt: { type?: string; agent_response_event?: { agent_response?: string }; ping_event?: { event_id?: number } };
      try {
        evt = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (evt.type) {
        case "conversation_initiation_metadata": {
          if (initialised) return;
          initialised = true;
          // Seed prior thread (does not trigger a reply), then send the real turn.
          if (historyContext) {
            ws!.send(JSON.stringify({ type: "contextual_update", text: historyContext }));
          }
          ws!.send(JSON.stringify({ type: "user_message", text: message }));
          break;
        }
        case "ping": {
          ws!.send(JSON.stringify({ type: "pong", event_id: evt.ping_event?.event_id }));
          break;
        }
        case "agent_response": {
          const reply = evt.agent_response_event?.agent_response?.trim();
          if (!reply) break;
          responses.push(reply);
          if (responses.length >= 2) {
            // Greeting + reply received — return the reply immediately.
            finish({ ok: true, reply: responses[1] });
          } else if (!settleTimer) {
            // Got the greeting; give the real reply a moment, else use this.
            settleTimer = setTimeout(finishWithBest, 9_000);
          }
          break;
        }
        default:
          break;
      }
    });

    ws.on("error", () => finish({ ok: false, error: "ws_error" }));
    ws.on("close", () => finishWithBest());
  });
}
