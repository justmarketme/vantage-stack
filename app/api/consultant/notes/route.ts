import { json, parseBody } from "@/lib/consultant/server/http";
import { createNote } from "@/lib/consultant/server/repo/notes";
import { consultantRoute } from "@/lib/consultant/server/route";
import { NoteInput, type Note } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Create a note; idempotent on `clientId` so offline replays don't duplicate. */
export async function POST(req: Request) {
  return consultantRoute("notes.create", undefined, async (s, db) => {
    const input = await parseBody(req, NoteInput);
    return json<Note>(await createNote(db, s, input), 201);
  });
}
