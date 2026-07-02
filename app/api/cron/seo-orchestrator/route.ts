import { NextResponse } from "next/server";
import { withRetries } from "../../../../lib/scheduler-engine/retry";
import { withSeoDb } from "../../../../lib/seo-orchestrator/store";
import { JOBS, type SeoJob } from "../../../../lib/seo-orchestrator/config";
import { JOB_FNS } from "../../../../lib/seo-orchestrator/jobs";

// SEO orchestrator dispatcher. Vercel Cron (or a manual call) hits this per job;
// each run advances DB state, emits an event, and creates a Cowork handoff.
// "Never give up" = bounded retries with backoff (not an infinite loop).
//
// Schedules (SAST → UTC) are wired in vercel.json. Auth: CRON_SECRET.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isCronAuthorized(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return true;
  const auth = (req.headers.get("authorization") || "").trim();
  if (auth === `Bearer ${secret}` || auth === secret) return true;
  const provided = (new URL(req.url).searchParams.get("secret") || "").trim();
  return provided !== "" && provided === secret;
}

async function handler(req: Request) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const job = new URL(req.url).searchParams.get("job") as SeoJob | null;
  if (!job || !JOBS.includes(job)) {
    return NextResponse.json({ ok: false, error: "unknown or missing ?job", jobs: JOBS }, { status: 400 });
  }

  const maxAttempts = 3;
  const out = await withRetries({
    maxAttempts,
    baseDelayMs: 750,
    run: async () => {
      const res = await withSeoDb((db) => JOB_FNS[job](db));
      if (res === null) throw new Error("DB unavailable");
      return res;
    },
  });

  if (!out.ok) {
    const msg = out.error instanceof Error ? out.error.message : String(out.error);
    return NextResponse.json({ ok: false, job, error: msg, attempts: out.attempts }, { status: 500 });
  }
  return NextResponse.json({ ok: true, job, result: out.value, attempts: out.attempts });
}

export const GET = handler;
export const POST = handler;
