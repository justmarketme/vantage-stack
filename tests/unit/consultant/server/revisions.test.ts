import { withCurrentFirst } from "../../../../lib/consultant/server/repo/notes";
import type { NoteRow } from "../../../../lib/consultant/server/mappers";

const note = (over: Partial<NoteRow> = {}): NoteRow => ({
  id: "n",
  client_id: "l",
  call_id: null,
  kind: "manual",
  body: "current body",
  version: 3,
  created_by_name: "Thabo",
  created_at: new Date("2026-09-01T10:00:00Z"),
  updated_by_name: "Lerato",
  updated_at: new Date("2026-09-03T10:00:00Z"),
  ...over,
});

describe("withCurrentFirst (GET notes/[id]/revisions)", () => {
  test("element 0 is the current version even when it is also stored", () => {
    const out = withCurrentFirst(note(), [
      { version: 3, body: "stale copy", editedBy: "Lerato", editedAt: "2026-09-03T10:00:00.000Z" },
      { version: 2, body: "v2", editedBy: "Thabo", editedAt: "2026-09-02T10:00:00.000Z" },
      { version: 1, body: "v1", editedBy: "Thabo", editedAt: "2026-09-01T10:00:00.000Z" },
    ]);
    expect(out.map((r) => r.version)).toEqual([3, 2, 1]);
    expect(out[0]).toEqual({ version: 3, body: "current body", editedBy: "Lerato", editedAt: "2026-09-03T10:00:00.000Z" });
  });

  test("a never-edited note synthesises its v1 from the creator", () => {
    const out = withCurrentFirst(note({ version: 1, updated_by_name: null, updated_at: null, body: "draft" }), []);
    expect(out).toEqual([{ version: 1, body: "draft", editedBy: "Thabo", editedAt: "2026-09-01T10:00:00.000Z" }]);
  });
});
