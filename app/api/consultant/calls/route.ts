import { rateLimit } from "@/lib/consultant/auth/rateLimit";
import { consultantConfig } from "@/lib/consultant/config";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { fail, json, parseBody } from "@/lib/consultant/server/http";
import { startCall } from "@/lib/consultant/server/repo/calls";
import { writerId } from "@/lib/consultant/server/repo/scope";
import { consultantRoute } from "@/lib/consultant/server/route";
import { StartCallInput, type Call } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create the call row the browser will reference in `Device.connect`. The number comes from the lead. */
export async function POST(req: Request) {
  return consultantRoute("calls.start", { call: true }, async (s, db) => {
    const memberId = writerId(s);
    const cfg = consultantConfig();
    if (!rateLimit(`calls:${memberId}`, cfg.limits.callsPerMinute, 60_000)) fail(429, MESSAGES.rateLimited);
    const { leadId } = await parseBody(req, StartCallInput);
    return json<Call>(await startCall(db, s, leadId.toLowerCase()), 201);
  });
}
