import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../lib/crm/http";
import { ensureWhatsAppSchema } from "../../../../lib/isabel/whatsapp-store";

export const dynamic = "force-dynamic";

/**
 * Isabel's WhatsApp threads for the CRM inbox (auth: middleware, /api/crm/*).
 * Every inbound message on the Vantage Stack number lands in
 * isabel_whatsapp_threads, so this is the complete history.
 */
export async function GET() {
  return withCrmHandler(async (db) => {
    await ensureWhatsAppSchema(db);
    const rows = await db`
      select t.phone, t.profile_name, t.transcript, t.opted_out,
             t.last_inbound_at, t.booking_status, t.booking_name, t.booking_email,
             t.created_at, t.updated_at,
             t.lead_client_id::text as lead_client_id, c.name::text as lead_client_name
      from public.isabel_whatsapp_threads t
      left join public.clients c on c.id = t.lead_client_id
      order by coalesce(t.last_inbound_at, t.updated_at) desc
      limit 200
    `;
    const threads = rows.map((r) => ({
      ...r,
      transcript: typeof r.transcript === "string" ? JSON.parse(r.transcript) : r.transcript ?? [],
    }));
    return NextResponse.json({ ok: true, threads });
  });
}
