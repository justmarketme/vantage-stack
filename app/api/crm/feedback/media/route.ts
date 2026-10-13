import { NextResponse } from "next/server";
import { isFeedbackBlobUrl, readPrivateBlob } from "@/lib/crm/proposal-feedback";

/** Streams a private feedback recording/screenshot to a signed-in CRM user (middleware gates /api/crm). */
export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url") ?? "";
  if (!isFeedbackBlobUrl(url)) return NextResponse.json({ ok: false, error: "Invalid media url" }, { status: 400 });
  const range = req.headers.get("range");
  try {
    const b = await readPrivateBlob(url, range ? { Range: range } : undefined);
    const headers = new Headers({
      "Content-Type": b.blob.contentType || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    });
    const contentRange = b.headers.get("content-range");
    const length = b.headers.get("content-length");
    if (length) headers.set("Content-Length", length);
    if (contentRange) headers.set("Content-Range", contentRange);
    return new Response(b.stream, { status: contentRange ? 206 : 200, headers });
  } catch {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }
}
