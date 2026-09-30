import { consultantConfig } from "@/lib/consultant/config";
import { buildWhisperTwiml, twimlResponse } from "@/lib/consultant/server/voice";
import { readTwilioWebhook } from "@/lib/consultant/server/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `<Number url>` whisper: runs on the clinic's leg after they answer and before the bridge,
 * so the POPIA recording notice is heard by the clinic only.
 */
export async function POST(req: Request) {
  const w = await readTwilioWebhook(req);
  if (w instanceof Response) return w;
  return twimlResponse(buildWhisperTwiml(consultantConfig()));
}
