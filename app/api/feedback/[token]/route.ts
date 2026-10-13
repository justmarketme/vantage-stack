import { NextResponse, after } from "next/server";
import { z } from "zod";
import { connectCrmDb } from "@/lib/crm/db";
import { getLinkByToken, isFeedbackBlobUrl, markOpened, processSession, saveSession } from "@/lib/crm/proposal-feedback";

export const maxDuration = 300;

const blobUrl = (linkId: string) =>
  z.string().refine((u) => isFeedbackBlobUrl(u) && new URL(u).pathname.startsWith(`/feedback/${linkId}/`), "Invalid file");

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "Database unavailable" }, { status: 503 });
  const link = await getLinkByToken(db, token);
  if (!link) return NextResponse.json({ ok: false, error: "This feedback link is not valid." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === "opened") {
    await markOpened(db, link.id);
    return NextResponse.json({ ok: true });
  }

  const Submit = z.object({
    action: z.literal("submit"),
    consent: z.literal(true),
    recording_url: blobUrl(link.id).nullable(),
    recording_kind: z.enum(["screen", "audio"]).nullable(),
    duration_seconds: z.number().min(0).max(4 * 3600).nullable(),
    items: z
      .array(
        z.object({
          client_ref: z.string().max(20),
          kind: z.enum(["pin", "drawing", "note"]),
          body: z.string().max(4000),
          x: z.number().min(0).max(100).nullable().optional(),
          y: z.number().min(0).max(100).nullable().optional(),
          at_seconds: z.number().min(0).nullable().optional(),
          screenshot_url: blobUrl(link.id).nullable().optional(),
        }),
      )
      .max(200),
  });
  const parsed = Submit.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid submission" }, { status: 400 });
  if (!parsed.data.recording_url && parsed.data.items.length === 0) {
    return NextResponse.json({ ok: false, error: "Add a recording, a pin or a note before sending." }, { status: 400 });
  }

  const sessionId = await saveSession(db, link, {
    recordingUrl: parsed.data.recording_url,
    recordingKind: parsed.data.recording_kind,
    durationSeconds: parsed.data.duration_seconds,
    userAgent: req.headers.get("user-agent") ?? "",
    items: parsed.data.items,
  });

  after(async () => {
    const bg = await connectCrmDb();
    if (bg) await processSession(bg, sessionId).catch(() => undefined);
  });

  return NextResponse.json({ ok: true, session_id: sessionId });
}
