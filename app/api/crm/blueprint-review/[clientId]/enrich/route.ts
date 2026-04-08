import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../../../lib/crm/http";
import { generateAndSaveBlueprint, type BlueprintClientData } from "../../../../../../lib/crm/blueprint-generator";
import { runWebsiteEnrichment } from "../../../../../../lib/crm/website-enrichment";

export async function POST(_req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;

  return withCrmHandler(async (db) => {
    const [client] = await db`
      select
        id::text, name::text, email::text, company::text, industry::text,
        website_url::text, whatsapp::text, monthly_budget::int,
        success_goals::text, current_marketing::text,
        challenges, competitors, tools_used, revenue_range::text
      from public.clients
      where id = ${clientId}::uuid
      limit 1
    `;

    if (!client) {
      return NextResponse.json({ ok: false, error: "Client not found" }, { status: 404 });
    }

    if (!client.website_url) {
      return NextResponse.json({ ok: false, error: "No website URL on file for this client." }, { status: 400 });
    }

    const enrichment = await runWebsiteEnrichment(
      client.website_url,
      client.company || client.name,
    );

    // Persist enrichment snapshot to intelligence_items for the record
    await db`
      insert into public.intelligence_items (client_id, title, body, source, severity, metadata)
      values (
        ${clientId}::uuid,
        ${"Website Audit — " + new Date().toLocaleDateString("en-ZA")},
        ${"Automated website enrichment: PageSpeed, SEO signals, OpenPageRank, Meta Ads, WHOIS."},
        ${"website_audit"},
        ${"info"},
        ${enrichment as any}::jsonb
      )
    `;

    const blueprint = await generateAndSaveBlueprint(db, client as unknown as BlueprintClientData, enrichment);

    return NextResponse.json({ ok: true, blueprint, enrichment });
  });
}
