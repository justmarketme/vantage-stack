import { consultantConfig } from "@/lib/consultant/config";
import { MESSAGES } from "@/lib/consultant/server/constants";
import { apiError, fail, logError, requireUuid } from "@/lib/consultant/server/http";
import { getCallRow } from "@/lib/consultant/server/repo/calls";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import { fetchRecording } from "@/lib/consultant/server/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASS_HEADERS = ["content-length", "content-range", "accept-ranges"] as const;

/**
 * Authenticated recording proxy. The browser only ever sees this URL: the Twilio media URL
 * and account credentials stay server-side. Supports a single `Range` so players can seek.
 */
export async function GET(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("calls.recording", undefined, async (s, db) => {
    const row = await getCallRow(db, s, requireUuid(id, MESSAGES.callNotFound));
    if (!row) fail(404, MESSAGES.callNotFound);
    if (!row.recording_sid) fail(404, MESSAGES.noRecording);

    let upstream: Response | null;
    try {
      upstream = await fetchRecording(consultantConfig(), row.recording_sid, req.headers.get("range"));
    } catch (e) {
      logError("calls.recording.fetch", e);
      return apiError(502, MESSAGES.recordingUnavailable);
    }
    if (!upstream) return apiError(503, MESSAGES.recordingUnavailable);
    if (upstream.status === 404) return apiError(404, MESSAGES.noRecording);
    if (upstream.status === 416) return new Response(null, { status: 416, headers: { "Cache-Control": "private, no-store" } });
    if ((upstream.status !== 200 && upstream.status !== 206) || !upstream.body) {
      console.error("[consultant] calls.recording upstream status", upstream.status);
      return apiError(502, MESSAGES.recordingUnavailable);
    }

    const headers = new Headers({
      "Content-Type": "audio/mpeg",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");
    return new Response(upstream.body, { status: upstream.status, headers });
  });
}
