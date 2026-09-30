import { NextResponse } from "next/server";
import { requireConsultant } from "@/lib/consultant/auth/session";
import { json } from "@/lib/consultant/server/http";
import type { Me } from "@/lib/consultant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await requireConsultant();
  if (s instanceof NextResponse) return s;
  return json<Me>({
    memberId: s.memberId,
    username: s.username,
    displayName: s.displayName,
    role: s.role,
    isManager: s.isManager,
    canCall: s.canCall,
  });
}
