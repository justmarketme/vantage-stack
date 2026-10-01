import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import type { ZodError, ZodType, ZodTypeDef } from "zod";
import { connectCrmDb, resetSingletonPool } from "../../crm/db";
import { portalStatusValues } from "../config";
import { ensureConsultantSchema } from "../schema";
import type { ApiError } from "../types";
import { MESSAGES } from "./constants";

/**
 * HTTP plumbing for `/api/consultant/**` and the Twilio webhooks.
 *
 * Clients only ever see `ApiError { error, fields? }` with a generic message. Driver, Twilio
 * and Anthropic error text never leaves the server, and server logs carry only an error
 * class / SQLSTATE and a route tag — never a phone number, email or transcript line.
 */

/** Throw from anywhere inside a handler to answer with a specific ApiError. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.error);
    this.name = "HttpError";
  }
}

export function fail(status: number, error: string, fields?: Record<string, string>): never {
  throw new HttpError(status, fields ? { error, fields } : { error });
}

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function json<T>(body: T, status = 200): NextResponse<T> {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function apiError(status: number, error: string, fields?: Record<string, string>): NextResponse<ApiError> {
  return json<ApiError>(fields ? { error, fields } : { error }, status);
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** zod issues → `{ path: message }`, first message per field wins. */
export function zodFields(err: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export function zodErrorResponse(err: ZodError): NextResponse<ApiError> {
  return apiError(400, MESSAGES.badRequest, zodFields(err));
}

/**
 * A body stream can only be read once, but withConsultantDb may re-run a handler after a
 * dropped pooler connection — so the parsed body is memoised per Request.
 */
const bodies = new WeakMap<Request, Promise<unknown>>();
function readJsonOnce(req: Request): Promise<unknown> {
  let p = bodies.get(req);
  if (!p) {
    p = req.json();
    bodies.set(req, p);
  }
  return p;
}

/** Parse a JSON body against a contract schema; throws HttpError 400 with field messages. */
export async function parseBody<O, I = O>(req: Request, schema: ZodType<O, ZodTypeDef, I>): Promise<O> {
  let raw: unknown;
  try {
    raw = await readJsonOnce(req);
  } catch {
    fail(400, MESSAGES.invalidJson);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, { error: MESSAGES.badRequest, fields: zodFields(parsed.error) });
  return parsed.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

/** Route param that must be a UUID; anything else is a 404 (don't reveal what exists). */
export function requireUuid(v: string | undefined, notFound: string = MESSAGES.notFound): string {
  if (!isUuid(v)) fail(404, notFound);
  return v.toLowerCase();
}

const CONNECTION_ERRORS = ["CONNECTION_ENDED", "CONNECTION_CLOSED", "CONNECTION_DESTROYED", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE"];

export function isConnectionError(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  if (typeof code === "string" && CONNECTION_ERRORS.includes(code)) return true;
  const msg = e instanceof Error ? e.message : "";
  return CONNECTION_ERRORS.some((c) => msg.includes(c)) || /connection terminated/i.test(msg);
}

/** A loggable, PII-free descriptor of an error: SQLSTATE / SDK class / Error name. */
export function errorTag(e: unknown): string {
  const code = (e as { code?: unknown })?.code;
  const name = e instanceof Error ? e.name : typeof e;
  return typeof code === "string" ? `${name}:${code}` : name;
}

export function logError(tag: string, e: unknown): void {
  console.error(`[consultant] ${tag} failed`, errorTag(e));
}

/** Postgres unique_violation. */
export function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown })?.code === "23505";
}

export async function connectConsultantDb(): Promise<Sql> {
  const db = await connectCrmDb();
  if (!db) throw new Error("CONSULTANT_DB_NOT_CONFIGURED");
  await ensureConsultantSchema(db, portalStatusValues());
  return db;
}

/**
 * Runs a handler with the shared pool and the consultant schema ensured.
 * - HttpError → its ApiError body.
 * - A pooler connection drop → reset the singleton pool and retry once.
 * - Anything else → logged (tag + class only) and a generic 500.
 * Never calls `db.end()` — the pool is a process-wide singleton.
 */
export async function withConsultantDb(tag: string, handler: (db: Sql) => Promise<Response>): Promise<Response> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const db = await connectConsultantDb();
      return await handler(db);
    } catch (e) {
      if (e instanceof HttpError) return json(e.body, e.status);
      if (attempt === 1 && isConnectionError(e)) {
        await resetSingletonPool();
        continue;
      }
      logError(tag, e);
      const unavailable = isConnectionError(e) || (e instanceof Error && e.message === "CONSULTANT_DB_NOT_CONFIGURED");
      return apiError(unavailable ? 503 : 500, unavailable ? MESSAGES.dbUnavailable : MESSAGES.serverError);
    }
  }
  return apiError(503, MESSAGES.dbUnavailable);
}

/** postgres.js omits the call signature from TransactionSql's type; the runtime object is callable. */
export function txSql(tx: unknown): Sql {
  return tx as Sql;
}
