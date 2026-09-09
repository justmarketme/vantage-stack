import { NextResponse } from "next/server";
import { withSeoDb, appendEvent, listHandoffs } from "../../../../lib/seo-orchestrator/store";

// Coordination seam for the DB-backed engine (COWORK_INTERFACE.md).
// Cowork's local process POSTs events here (they show live in the SEO Ops tab)
// and GETs the pending handoffs the engine created for it. Auth: CRON_SECRET.
//
// Deliberately NOT under /api/crm/* (which the middleware admin-session-gates) —
// this is server-to-server, guarded by CRON_SECRET instead.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authed(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const auth = (req.headers.get("authorization") || "").trim();
  if (auth === `Bearer ${secret}` || auth === secret) return true;
  return (new URL(req.url).searchParams.get("secret") || "").trim() === secret;
}

export async function POST(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  let body: { agent?: string; task?: string; status?: string; progress?: number; meta?: Record<string, unknown> } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }
  if (!body.agent || !body.task || !body.status) {
    return NextResponse.json({ ok: false, error: "agent, task and status are required" }, { status: 400 });
  }
  const res = await withSeoDb((db) =>
    appendEvent(db, {
      agent: body.agent!,
      task: body.task!,
      status: body.status!,
      progress: body.progress,
      meta: body.meta,
    }),
  );
  if (res === null) return NextResponse.json({ ok: false, error: "DB unavailable" }, { status: 503 });
  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  if (!authed(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const handoffs = await withSeoDb((db) => listHandoffs(db, "ready"));
  return NextResponse.json({ ok: true, handoffs: handoffs ?? [] });
}
