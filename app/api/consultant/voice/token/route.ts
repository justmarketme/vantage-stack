import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/consultant/auth/rateLimit";
import { requireConsultant } from "@/lib/consultant/auth/session";
import { mintVoiceToken } from "@/lib/consultant/auth/voiceToken";
import { consultantConfig } from "@/lib/consultant/config";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { apiError, json } from "@/lib/consultant/server/http";
import type { VoiceToken } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Browser Voice access token — member sessions with calling rights only; rate-limited. */
export async function POST() {
  const s = await requireConsultant({ call: true });
  if (s instanceof NextResponse) return s;
  if (!s.memberId) return apiError(403, MESSAGES.readOnly);
  const cfg = consultantConfig();
  if (!rateLimit(`voice-token:${s.memberId}`, cfg.limits.tokenPerMinute, 60_000)) {
    return apiError(429, MESSAGES.rateLimited);
  }
  const token = mintVoiceToken(s.memberId, cfg);
  if (!token) return apiError(503, MESSAGES.voiceUnavailable);
  return json<VoiceToken>(token);
}
