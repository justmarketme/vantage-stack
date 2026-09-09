import { NextResponse } from "next/server";
import { connectProspectingDb } from "../../../../../lib/prospecting/db";
import { getProspect, updateProspect, listEngagements } from "../../../../../lib/prospecting/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const prospect = await getProspect(db, id);
  if (!prospect) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const engagements = await listEngagements(db, { prospect_id: id });

  return NextResponse.json({ ok: true, prospect, engagements });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const body = await req.json();
  const prospect = await updateProspect(db, id, body);
  if (!prospect) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  return NextResponse.json({ ok: true, prospect });
}
