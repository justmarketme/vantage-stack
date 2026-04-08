import { NextResponse } from "next/server";
import { withCrmHandler } from "../../../../lib/crm/http";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "20"), 100);
  const clientId = url.searchParams.get("client_id") ?? null;

  return withCrmHandler(async (db) => {
    const rows = clientId
      ? await db`
          select
            a.id::text as id,
            a.action_type::text as action_type,
            c.name::text as client_name,
            a.user_actor::text as user_actor,
            a.details,
            a.created_at
          from public.crm_activity a
          left join public.clients c on c.id = a.client_id
          where a.client_id = ${clientId}::uuid
          order by a.created_at desc
          limit ${limit}
        `
      : await db`
          select
            a.id::text as id,
            a.action_type::text as action_type,
            c.name::text as client_name,
            a.user_actor::text as user_actor,
            a.details,
            a.created_at
          from public.crm_activity a
          left join public.clients c on c.id = a.client_id
          order by a.created_at desc
          limit ${limit}
        `;

    return NextResponse.json({ ok: true, activity: [...rows] });
  });
}
