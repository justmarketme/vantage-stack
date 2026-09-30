import { MESSAGES } from "@/lib/consultant/server/constants";
import { json, requireUuid } from "@/lib/consultant/server/http";
import { listRevisions } from "@/lib/consultant/server/repo/notes";
import { consultantRoute, type IdContext } from "@/lib/consultant/server/route";
import type { NoteRevision } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: IdContext) {
  const id = (await ctx.params).id;
  return consultantRoute("notes.revisions", undefined, async (s, db) =>
    json<NoteRevision[]>(await listRevisions(db, s, requireUuid(id, MESSAGES.noteNotFound))),
  );
}
