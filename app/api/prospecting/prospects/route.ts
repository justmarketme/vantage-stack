import { NextResponse } from "next/server";
import { connectProspectingDb } from "../../../../lib/prospecting/db";
import { createProspect, listProspects, getDailyStats } from "../../../../lib/prospecting/service";
import { detectIntentSignals } from "../../../../lib/prospecting/service";
import { researchProspect } from "../../../../lib/prospecting/research";
import { draftReply } from "../../../../lib/prospecting/drafter";
import { createEngagement } from "../../../../lib/prospecting/service";
import { sendApprovalRequest } from "../../../../lib/prospecting/teams";
import type { Track } from "../../../../lib/prospecting/types";

export async function GET(req: Request) {
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const url = new URL(req.url);
  const stage = url.searchParams.get("stage") as any;
  const track = url.searchParams.get("track") as Track | null;
  const confidence = url.searchParams.get("confidence") as any;
  const platform = url.searchParams.get("platform") || undefined;
  const limit = Number(url.searchParams.get("limit") || 50);
  const offset = Number(url.searchParams.get("offset") || 0);

  if (url.searchParams.get("stats") === "daily") {
    const stats = await getDailyStats(db, url.searchParams.get("date") || undefined);
    return NextResponse.json({ ok: true, stats });
  }

  const prospects = await listProspects(db, {
    stage: stage || undefined,
    track: track || undefined,
    confidence: confidence || undefined,
    platform,
    limit,
    offset,
  });

  return NextResponse.json({ ok: true, prospects, count: prospects.length });
}

export async function POST(req: Request) {
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const body = await req.json();
  const { source_platform, source_url, source_text, track, name, business_name, ...rest } = body;

  if (!source_platform || !source_text) {
    return NextResponse.json({ ok: false, error: "source_platform and source_text required" }, { status: 400 });
  }

  const { signals, topCategory } = detectIntentSignals(source_text);

  const prospect = await createProspect(db, {
    source_platform,
    source_url: source_url || "",
    source_text,
    name: name || null,
    business_name: business_name || null,
    pain_point: topCategory || body.pain_point || "general",
    intent_signals: signals.length > 0 ? signals : (body.intent_signals || []),
    track: track || "standard",
    ...rest,
  });

  // Auto-run research in background (best-effort)
  const research = await researchProspect(db, prospect).catch(() => null);

  // Auto-draft a reply
  const draft = draftReply(research ? { ...prospect, ...research } as any : prospect);
  const engagement = await createEngagement(db, {
    prospect_id: prospect.id,
    channel: source_platform,
    message_text: draft.message_text,
    cta_type: draft.cta_type,
    cta_url: draft.cta_url,
    status: "pending_approval",
  });

  // Send to Teams for approval (best-effort)
  const refreshedProspect = research
    ? { ...prospect, confidence_flag: research.confidence_flag, research_findings: research.findings }
    : prospect;
  await sendApprovalRequest(refreshedProspect as any, engagement).catch(() => {});

  return NextResponse.json({
    ok: true,
    prospect: refreshedProspect,
    engagement,
    research: research ? { confidence: research.confidence_flag, findings: research.findings } : null,
  });
}
