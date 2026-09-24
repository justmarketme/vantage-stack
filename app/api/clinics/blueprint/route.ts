import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { ClinicBlueprintSchema } from "../../../../lib/clinics/schema";
import { insertClinicBlueprint } from "../../../../lib/clinics/store";
import { clientIp, rateLimit } from "../../../../lib/clinics/rateLimit";
import { connectCrmDb } from "../../../../lib/crm/db";

/**
 * Public, unauthenticated write endpoint. Everything below exists because of
 * that: it is reachable by anyone on the internet and it puts a row in
 * Postgres, so it needs its own ceilings rather than trusting the client that
 * called it.
 */

/** 5 submissions per IP per 10 minutes. A real clinic owner submits once. */
const LIMIT = 5;
const WINDOW_MS = 10 * 60 * 1000;

/** Reject oversized bodies before parsing rather than after. */
const MAX_BODY_BYTES = 16 * 1024;

async function handler(req: Request) {
  // ── Rate limit ──────────────────────────────────────────────────
  const ip = clientIp(req);
  const limit = rateLimit(`clinic-blueprint:${ip}`, LIMIT, WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many submissions. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  // ── Body size ───────────────────────────────────────────────────
  // Content-Length is advisory (absent on chunked requests), so we also cap the
  // text we actually read. Checking the header first avoids buffering a large
  // body just to reject it.
  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }

  const raw = await req.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  // ── Honeypot ────────────────────────────────────────────────────
  // The form renders a visually hidden `company_website` field that no human
  // ever fills. Bots that blindly complete every input trip it. We return 200
  // with no write, so the bot sees success and does not retry or adapt.
  const honeypot = (body as Record<string, unknown>)?.company_website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    return NextResponse.json({ ok: true, id: null }, { status: 200 });
  }

  const parsed = ClinicBlueprintSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });

  try {
    const { id } = await insertClinicBlueprint(db, parsed.data, { source: "clinics_landing" });
    return NextResponse.json({ ok: true, id }, { status: 200 });
  } catch (err) {
    // Log server-side, return a generic message: driver errors can carry
    // connection strings, table names and constraint details, none of which
    // belong in a public response body.
    console.error("[clinics/blueprint] insert failed", err);
    return NextResponse.json({ ok: false, error: "Could not save your answers. Please try again." }, { status: 500 });
  } finally {
    await db.end({ timeout: 5 });
  }
}

export const POST = withApiMonitoring({
  route: "/api/clinics/blueprint",
  method: "POST",
  handler,
});
