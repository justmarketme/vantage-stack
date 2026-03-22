import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { withCrmHandler } from "../../../../lib/crm/http";
import { listClients } from "../../../../lib/crm/service";

async function handler(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams;
  return withCrmHandler(async (db) => {
    const out = await listClients(db, {
      status: q.get("status") ?? undefined,
      industry: q.get("industry") ?? undefined,
      revenue_range: q.get("revenue_range") ?? undefined,
      date_from: q.get("date_from") ?? undefined,
      date_to: q.get("date_to") ?? undefined,
      search_text: q.get("search") ?? q.get("search_text") ?? undefined,
      sort: (q.get("sort") as "newest" | "oldest" | "name" | "last_activity") ?? "newest",
      page: q.get("page") ? Number(q.get("page")) : 1,
      per_page: q.get("per_page") ? Number(q.get("per_page")) : 20,
    });
    return NextResponse.json(out);
  });
}

export const GET = withApiMonitoring({ route: "/api/crm/clients", method: "GET", handler });
