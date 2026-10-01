import { MESSAGES } from "@/lib/consultant/server/constants";
import { json, parseBody, requireUuid } from "@/lib/consultant/server/http";
import { patchNote } from "@/lib/consultant/server/repo/notes";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import { NotePatch, type Note } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Edit with optimistic concurrency: 409 if `baseVersion` is stale; every edit keeps a revision. */
export async function PATCH(req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("notes.patch", undefined, async (s, db) => {
    const noteId = requireUuid(id, MESSAGES.noteNotFound);
    const patch = await parseBody(req, NotePatch);
    return json<Note>(await patchNote(db, s, noteId, patch));
  });
}
