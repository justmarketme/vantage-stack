import { NextResponse } from "next/server";
import { connectProspectingDb } from "../../../../lib/prospecting/db";
import { listChannels, upsertChannel } from "../../../../lib/prospecting/service";
import { DEFAULT_CHANNELS } from "../../../../lib/prospecting/types";
import type { Track } from "../../../../lib/prospecting/types";

export async function GET(req: Request) {
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const url = new URL(req.url);
  const track = url.searchParams.get("track") as Track | null;
  const enabled = url.searchParams.get("enabled");

  const channels = await listChannels(db, {
    track: track || undefined,
    enabled: enabled !== null ? enabled === "true" : undefined,
  });

  return NextResponse.json({ ok: true, channels });
}

export async function POST(req: Request) {
  const db = await connectProspectingDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database" }, { status: 500 });

  const url = new URL(req.url);
  if (url.searchParams.get("seed") === "defaults") {
    const results = [];
    for (const ch of DEFAULT_CHANNELS) {
      results.push(await upsertChannel(db, ch));
    }
    return NextResponse.json({ ok: true, channels: results, seeded: results.length });
  }

  const body = await req.json();
  const channel = await upsertChannel(db, body);
  return NextResponse.json({ ok: true, channel });
}
