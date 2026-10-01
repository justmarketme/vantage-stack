import { json, parseBody } from "@/lib/consultant/server/http";
import { createMeeting, listMeetings, parseMeetingQuery } from "@/lib/consultant/server/repo/meetings";
import { consultantRoute } from "@/lib/consultant/server/route";
import { MeetingInput, type Meeting } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Meetings visible to the caller. `?leadId=` → that lead's history; otherwise the upcoming window (or `?from=&to=`). */
export async function GET(req: Request) {
  return consultantRoute("meetings.list", undefined, async (s, db) => {
    const q = parseMeetingQuery(new URL(req.url).searchParams);
    return json<Meeting[]>(await listMeetings(db, s, q));
  });
}

/** Book a discovery / demo / follow-up. Moves the lead's stage and syncs the consultant's calendars. */
export async function POST(req: Request) {
  return consultantRoute("meetings.create", undefined, async (s, db) => {
    const input = await parseBody(req, MeetingInput);
    return json<Meeting>(await createMeeting(db, s, input), 201);
  });
}
