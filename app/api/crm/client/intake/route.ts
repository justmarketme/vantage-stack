import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../../lib/monitoring/api";
import { connectCrmDb, ensureCrmSchema } from "../../../../../lib/crm/db";
import { performClientIntake } from "../../../../../lib/crm/intake";
import { CrmClientIntakeSchema } from "../../../../../lib/crm/crm-intake-schema";
import { parseMonthlyBudgetToInt } from "../../../../../lib/blueprint/schema";

async function handler(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = CrmClientIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }

  const data = parsed.data;
  if (!parseMonthlyBudgetToInt(data.monthlyBudget)) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: [{ path: ["monthlyBudget"], message: "Monthly budget must look like a number (e.g. 5000 or 5k)." }] },
      { status: 400 },
    );
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });

  try {
    await ensureCrmSchema(db);
    const { company, intake_source, created_by, skip_research, jump_to_status, ...blueprint } = data;
    const out = await performClientIntake(db, blueprint, {
      source: intake_source,
      createdBy: created_by,
      company: company || undefined,
      skipResearch: skip_research,
      jumpToStatus: jump_to_status,
    });

    if (!out.ok) {
      return NextResponse.json(
        { ok: false, error: out.error, message: "message" in out ? out.message : undefined },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, client_id: out.client_id, status: out.status }, { status: 201 });
  } finally {
    await db.end({ timeout: 5 });
  }
}

export const POST = withApiMonitoring({
  route: "/api/crm/client/intake",
  method: "POST",
  handler,
});
