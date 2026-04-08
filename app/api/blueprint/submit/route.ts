import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { BlueprintSubmitSchema, parseMonthlyBudgetToInt } from "../../../../lib/blueprint/schema";
import { connectCrmDb } from "../../../../lib/crm/db";
import { performClientIntake } from "../../../../lib/crm/intake";

async function handler(req: Request) {
  const body = await req.json().catch(() => ({}));
  const parsed = BlueprintSubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  if (!parseMonthlyBudgetToInt(payload.monthlyBudget)) {
    return NextResponse.json(
      { ok: false, error: "Validation failed", issues: [{ path: ["monthlyBudget"], message: "Monthly budget must look like a number (e.g. 5000 or 5k)." }] },
      { status: 400 },
    );
  }

  const db = await connectCrmDb();
  if (!db) return NextResponse.json({ ok: false, error: "Missing DATABASE_URL" }, { status: 500 });

  try {
    const out = await performClientIntake(db, payload, { source: "blueprint_form" });
    if (!out.ok) {
      return NextResponse.json({ ok: false, error: out.error, message: "message" in out ? out.message : undefined }, { status: 500 });
    }
    return NextResponse.json({ ok: true, clientId: out.client_id }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 },
    );
  } finally {
    await db.end({ timeout: 5 });
  }
}

export const POST = withApiMonitoring({ route: "/api/blueprint/submit", method: "POST", handler });

