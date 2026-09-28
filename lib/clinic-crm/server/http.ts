import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import type { ApiError } from "../types";
import { publicBaseUrl } from "./config";
import { isUuid } from "./rules";

/**
 * Experience-layer plumbing shared by every Clinic CRM route handler:
 * consistent ApiError bodies, zod → `fields` maps, and a 500 wrapper that logs a
 * request id + error class/code only — never the message (driver messages can
 * contain patient values, e.g. a unique-violation detail with a phone number).
 */

export function apiError(status: number, error: string, fields?: Record<string, string>): NextResponse<ApiError> {
  return NextResponse.json(fields ? { error, fields } : { error }, { status });
}

export const notFound = () => apiError(404, "Not found");

export function fieldErrors(err: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const k = issue.path.join(".") || "_";
    fields[k] ??= issue.message;
  }
  return fields;
}

export function validate<S extends z.ZodTypeAny>(
  schema: S,
  value: unknown,
): { ok: true; data: z.infer<S> } | { ok: false; res: NextResponse<ApiError> } {
  const parsed = schema.safeParse(value);
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, res: apiError(400, "Please check the highlighted fields", fieldErrors(parsed.error)) };
}

export async function parseBody<S extends z.ZodTypeAny>(req: NextRequest, schema: S) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return { ok: false as const, res: apiError(400, "Request body must be JSON") };
  }
  return validate(schema, json);
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: Ctx<P>) => Promise<Response>;

/** Wraps a handler: any uncaught error → generic 500 with a request id, no PII in logs or body. */
export function route<P = Record<string, never>>(name: string, handler: Handler<P>): Handler<P> {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      const rid = randomUUID().slice(0, 8);
      const err = e as { name?: string; code?: string; constraint_name?: string };
      console.error(`[clinic-crm] ${name} failed rid=${rid}`, err?.name ?? "Error", err?.code ?? "", err?.constraint_name ?? "");
      return NextResponse.json({ error: "Something went wrong" } satisfies ApiError, {
        status: 500,
        headers: { "x-request-id": rid },
      });
    }
  };
}

/** Resolves a dynamic `[id]` param, 404ing anything that isn't a UUID (so Postgres never sees a bad cast). */
export async function idParam(ctx: Ctx<{ id: string }>): Promise<string | null> {
  const { id } = await ctx.params;
  return isUuid(id) ? id : null;
}

export const noStore = { headers: { "Cache-Control": "no-store" } };

/** The URL Twilio signed: the configured public origin + our path + query (req.url's host can differ behind Vercel). */
export function signedUrl(req: NextRequest): string {
  return `${publicBaseUrl()}${req.nextUrl.pathname}${req.nextUrl.search}`;
}

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
export function twiml(status = 200): Response {
  return new Response(EMPTY_TWIML, { status, headers: { "Content-Type": "text/xml" } });
}
