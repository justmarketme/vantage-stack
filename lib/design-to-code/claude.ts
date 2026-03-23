/**
 * Optional Anthropic Messages API call for design-to-code automation.
 * Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL, default claude-sonnet-4-20250514).
 */

export type ClaudeCallResult =
  | { ok: true; text: string; model: string; stopReason: string | null }
  | { ok: false; error: string };

export async function callClaudeMessages(system: string, user: string): Promise<ClaudeCallResult> {
  const key = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (!key) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  }
  const model = (process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514").trim();
  const maxTokens = Math.min(8192, Number(process.env.ANTHROPIC_MAX_TOKENS || "8192") || 8192);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, error: `Anthropic API ${res.status}: ${raw.slice(0, 500)}` };
  }

  let parsed: {
    content?: { type: string; text?: string }[];
    stop_reason?: string | null;
  };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return { ok: false, error: "Invalid JSON from Anthropic API" };
  }

  const text = (parsed.content ?? [])
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text as string)
    .join("\n");

  return { ok: true, text, model, stopReason: parsed.stop_reason ?? null };
}
