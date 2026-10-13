import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { connectCrmDb } from "@/lib/crm/db";
import { getLinkByToken } from "@/lib/crm/proposal-feedback";

const ALLOWED = ["video/webm", "video/mp4", "audio/webm", "audio/mp4", "audio/ogg", "image/jpeg", "image/png"];

/** Issues short-lived client-upload tokens so recordings go browser → Blob directly (no function body limit). */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const link = await getLinkByToken(db, token);
  if (!link) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`feedback/${link.id}/`)) throw new Error("Invalid upload path");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: 1024 * 1024 * 1024,
          addRandomSuffix: true,
          validUntil: Date.now() + 60 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
