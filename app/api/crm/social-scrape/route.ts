import { NextResponse } from "next/server";
import { connectCrmDb } from "../../../../lib/crm/db";
import { scrapeSocialProfiles, formatInsightsForBlueprint } from "../../../../lib/crm/social-scraper";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { clientId?: string };
  const clientId = (body.clientId || "").trim();
  if (!clientId) return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });

  if (!process.env.APIFY_TOKEN) {
    return NextResponse.json({ ok: false, error: "APIFY_TOKEN not configured" }, { status: 503 });
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "No database connection" }, { status: 500 });

  try {
    const clients = await db<Array<{
      id: string;
      name: string;
      social_instagram: string | null;
      social_tiktok: string | null;
      social_facebook: string | null;
      social_x: string | null;
      social_youtube: string | null;
    }>>`
      select id, name, social_instagram, social_tiktok, social_facebook, social_x, social_youtube
      from public.clients where id = ${clientId}::uuid limit 1
    `;

    const client = clients[0];
    if (!client) return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });

    const hasSocials =
      client.social_instagram || client.social_tiktok ||
      client.social_facebook || client.social_x || client.social_youtube;

    if (!hasSocials) {
      return NextResponse.json({ ok: false, error: "No social media links on file for this client" }, { status: 400 });
    }

    const result = await scrapeSocialProfiles({
      instagram: client.social_instagram,
      tiktok: client.social_tiktok,
      facebook: client.social_facebook,
      x: client.social_x,
      youtube: client.social_youtube,
    });

    // Save insights JSON back to client record
    await db`
      update public.clients
      set social_insights = ${JSON.stringify(result.insights)}::jsonb, updated_at = now()
      where id = ${clientId}::uuid
    `;

    // Save a summary intelligence item for the Research tab
    const summary = formatInsightsForBlueprint(result.insights);
    if (summary) {
      await db`
        insert into public.intelligence_items (client_id, title, body, source, severity, metadata)
        values (
          ${clientId}::uuid,
          'Social Media Analysis',
          ${summary},
          'social_scraper',
          'info',
          ${JSON.stringify({ platforms: result.insights.map((i) => i.platform), errors: result.errors })}::jsonb
        )
      `;
    }

    return NextResponse.json({
      ok: true,
      platforms: result.insights.map((i) => i.platform),
      errors: result.errors,
      insightCount: result.insights.length,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Scraping failed" },
      { status: 500 }
    );
  } finally {
    await db.end({ timeout: 5 });
  }
}
