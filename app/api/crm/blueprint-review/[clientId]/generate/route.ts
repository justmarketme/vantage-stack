import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../../../lib/crm/http";
import { generateAndSaveBlueprint, type BlueprintClientData } from "../../../../../../lib/crm/blueprint-generator";

export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return withCrmHandler(async (db) => {
    const [client] = await db`
      select
        id::text, name::text, email::text, company::text, industry::text,
        website_url::text, whatsapp::text, monthly_budget::int,
        success_goals::text, current_marketing::text,
        challenges, competitors, tools_used, revenue_range::text,
        social_instagram::text, social_tiktok::text, social_facebook::text,
        social_x::text, social_youtube::text, social_insights
      from public.clients
      where id = ${clientId}::uuid
      limit 1
    `;

    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    const blueprint = await generateAndSaveBlueprint(db, client as unknown as BlueprintClientData);
    return NextResponse.json({ ok: true, blueprint });
  });
}
