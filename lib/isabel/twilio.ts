import { createHmac } from "crypto";

/**
 * Twilio inbound webhook helpers for the Isabel WhatsApp bot.
 *
 * - Validates the `X-Twilio-Signature` header (HMAC-SHA1 over the full URL plus
 *   the POST params, sorted by key and concatenated) so only Twilio can drive
 *   Isabel.
 * - Reformats Isabel's website-flavoured replies for WhatsApp, which can't use
 *   in-page `#anchor` links.
 */

/** Validate a Twilio request signature. `url` must be the exact URL Twilio called. */
export function validateTwilioSignature(params: {
  authToken: string;
  signature: string | null;
  url: string;
  body: Record<string, string>;
}): boolean {
  const { authToken, signature, url, body } = params;
  if (!authToken || !signature) return false;

  const sorted = Object.keys(body).sort();
  let data = url;
  for (const key of sorted) data += key + body[key];

  const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");

  // Constant-time-ish comparison.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

/**
 * Validate against several candidate URLs. Twilio signs the *exact* URL it was
 * configured to call; behind a proxy / with env drift (www vs apex, trailing
 * slash, the *.vercel.app host) the recomputed URL can differ, so we accept if
 * any candidate matches. Security is unchanged — it still requires the correct
 * auth token and a valid signature.
 */
export function validateTwilioSignatureAny(params: {
  authToken: string;
  signature: string | null;
  urls: string[];
  body: Record<string, string>;
}): boolean {
  const seen = new Set<string>();
  for (const url of params.urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    if (validateTwilioSignature({ authToken: params.authToken, signature: params.signature, url, body: params.body })) {
      return true;
    }
  }
  return false;
}

/**
 * Turn Isabel's reply into WhatsApp-friendly text:
 * - `[label](#section)` → `label: <appUrl>/#section`
 * - `[label](https://…)` → `label: https://…`
 * Absolute links keep their URL; in-page anchors are resolved against the app URL.
 */
export function formatForWhatsApp(reply: string): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  return reply
    .replace(linkRe, (_m, label: string, href: string) => {
      const url = href.startsWith("#") && appUrl ? `${appUrl}/${href}` : href;
      return `${label}: ${url}`;
    })
    .trim();
}

/** Escape text for inclusion in a TwiML XML body. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a TwiML <Response><Message> document for a synchronous reply. */
export function twimlMessage(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(text)}</Message></Response>`;
}

/** Empty TwiML — acknowledge without replying. */
export function twimlEmpty(): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
}
