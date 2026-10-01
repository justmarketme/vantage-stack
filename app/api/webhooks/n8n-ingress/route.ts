import { consultantConfig } from "@/lib/consultant/config";
import { verifyBody } from "@/lib/consultant/auth/signing";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { kickEmma } from "@/lib/consultant/server/emma/sender";
import { kickDispatch } from "@/lib/consultant/server/events/dispatch";
import { handleIngress } from "@/lib/consultant/server/events/ingress";
import { apiError, json, withConsultantDb, zodErrorResponse } from "@/lib/consultant/server/http";
import { MESSAGES_3A } from "@/lib/consultant/metrics/tunables";
import { N8nIngress } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * n8n → app (no session). The signature is verified over the EXACT raw body string
 * (`await req.text()`), then that same string is parsed — never re-serialised. Unsigned,
 * stale (outside cfg.n8n.toleranceSec) or unconfigured-secret requests get 401 and nothing runs.
 */
export async function POST(req: Request) {
  const cfg = consultantConfig().n8n;
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return apiError(400, MESSAGES.invalidJson);
  }
  if (!verifyBody(cfg.signingSecret, raw, req.headers.get("x-vs-signature"), cfg.toleranceSec)) {
    return apiError(401, MESSAGES_3A.badSignature);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return apiError(400, MESSAGES.invalidJson);
  }
  const parsed = N8nIngress.safeParse(data);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  return withConsultantDb("webhook.n8n", async (db) => {
    const out = await handleIngress(db, parsed.data);
    if (!out.body.replay) {
      if (parsed.data.action === "emma.send" || parsed.data.action === "emma.notify_consultant") kickEmma();
      kickDispatch();
    }
    return json(out.body, out.status);
  });
}
