import { fail, json, parseBody, requireUuid } from "@/lib/consultant/server/http";
import { getMeeting, MEETING_MESSAGES, patchMeeting } from "@/lib/consultant/server/repo/meetings";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import { MeetingPatch, type Meeting } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("meetings.get", undefined, async (s, db) => {
    const m = await getMeeting(db, s, requireUuid(id, MEETING_MESSAGES.notFound));
    if (!m) fail(404, MEETING_MESSAGES.notFound);
    return json<Meeting>(m);
  });
}

/** Reschedule, add notes, or mark held / no-show / cancelled (stage automation + calendar follow). */
export async function PATCH(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("meetings.patch", undefined, async (s, db) => {
    const meetingId = requireUuid(id, MEETING_MESSAGES.notFound);
    const patch = await parseBody(req, MeetingPatch);
    return json<Meeting>(await patchMeeting(db, s, meetingId, patch));
  });
}
