import { NextResponse } from "next/server";
import { withApiMonitoring } from "../../../../lib/monitoring/api";
import { handleUserInputInternal } from "../../../../mcp/telegram-orchestrator/server";
import { corsPreflight, withCors } from "../../../../lib/api/cors";

function asObj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function handler(req: Request) {
  const body = asObj(await req.json().catch(() => ({})));
  const textRaw = typeof body.text === "string" ? body.text.trim() : "";
  const chatIdRaw = body.chat_id;
  const fromUser = typeof body.from_user === "string" ? body.from_user.trim() : undefined;
  const sendRaw = body.send;

  if (!textRaw) {
    return withCors(NextResponse.json({ ok: false, error: "Missing required field: text" }, { status: 400 }), req);
  }

  const out = await handleUserInputInternal({
    text: textRaw,
    chat_id: typeof chatIdRaw === "string" || typeof chatIdRaw === "number" ? chatIdRaw : undefined,
    from_user: fromUser,
    send: typeof sendRaw === "boolean" ? sendRaw : false,
  });

  return withCors(NextResponse.json({ ok: true, result: out }), req);
}

export const POST = withApiMonitoring({ route: "/api/telegram/command", method: "POST", handler });

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
