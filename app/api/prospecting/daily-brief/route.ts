import { NextResponse } from "next/server";
import { connectProspectingDb } from "../../../../lib/prospecting/db";
import { getDailyStats, listProspects } from "../../../../lib/prospecting/service";
import { sendDailyBrief } from "../../../../lib/prospecting/teams";

export async function GET(req: Request) {
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const stats = await getDailyStats(db, today);

  const recentLeads = await listProspects(db, { limit: 10 });
  const topLeads = recentLeads.map((p) => ({
    name: p.name || "Unknown",
    business: p.business_name || "?",
    platform: p.source_platform,
    pain: p.pain_point,
    confidence: p.confidence_flag,
  }));

  const brief = {
    date: today,
    top_leads: topLeads,
    stats: {
      found: stats.leads_found,
      contacted: stats.leads_contacted,
      responded: stats.leads_responded,
      booked: stats.calls_booked,
    },
    pending_approvals: stats.pending_approvals,
  };

  await sendDailyBrief(brief).catch(() => {});

  return NextResponse.json({ ok: true, brief });
}
