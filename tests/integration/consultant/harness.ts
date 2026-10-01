/**
 * Real-Postgres harness for the Consultant Portal integration suite.
 *
 * Opt-in: set CONSULTANT_IT_PG_URL to an ADMIN connection string of a THROWAWAY Postgres
 * server (e.g. `postgres://postgres@127.0.0.1:55432/postgres`). Each test file creates its own
 * fresh database on that server, applies the real CRM migrations
 * (`mcp/database-architect/migrations/*.sql`, with a stub Supabase `auth` schema), points
 * DATABASE_URL at it, and drops it afterwards. Without the variable every suite is skipped,
 * so CI without Postgres stays green. It deliberately does NOT reuse DATABASE_URL: these
 * tests create and drop databases and must never run against a real project.
 *
 * Start that server with `-c max_connections=300`: the suites run in parallel and each opens
 * its own pool, so the default 100 connections runs out and whole suites fail in beforeAll.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres, { type Sql } from "postgres";
import twilio from "twilio";
import type { ConsultantSession } from "../../../lib/consultant/auth/session";
import { permissionsFor } from "../../../lib/admin/roles";

export const IT_PG_URL = (process.env.CONSULTANT_IT_PG_URL ?? "").trim();
export const describeDb: jest.Describe = IT_PG_URL ? describe : describe.skip;

export const PUBLIC_URL = "https://portal.example.test";
export const AUTH_TOKEN = "it-test-auth-token-0123456789abcdef";

const MIGRATIONS_DIR = join(process.cwd(), "mcp", "database-architect", "migrations");

/** Statuses a production `clients.status` enum is assumed to carry before the portal runs. */
const LEGACY_STATUSES = ["blueprint-submitted", "manually-added", "report-sent", "active-client", "upsell-sent", "churned"];

/** Env for every consultant module: a test Twilio token and origin, no AI key, no real DB URLs. */
export function applyTestEnv(): void {
  for (const k of ["SUPABASE_DATABASE_POOLER_URL", "SUPABASE_DB_URL", "REPORTS_PG_URL", "BRIEFING_PG_URL", "WEEKLY_PG_URL", "TELEGRAM_PG_URL"]) {
    delete process.env[k];
  }
  process.env.CONSULTANT_PUBLIC_URL = PUBLIC_URL;
  process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
  process.env.TWILIO_ACCOUNT_SID = `AC${"0".repeat(32)}`;
  process.env.CONSULTANT_CALLER_ID = "+27100000000";
  delete process.env.CONSULTANT_TWILIO_SKIP_SIGNATURE;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test-not-real";
}

function withDatabase(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

export type TestDb = { name: string; url: string; sql: Sql; drop: () => Promise<void> };

/** Create a fresh database with the real CRM migrations applied. `statusEnum` converts clients.status to an enum. */
export async function createTestDatabase(opts: { statusEnum?: boolean } = {}): Promise<TestDb> {
  const admin = postgres(IT_PG_URL, { max: 1, onnotice: () => undefined });
  const name = `vsqa_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await admin.unsafe(`create database ${name}`);
  await admin.unsafe(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    end $$;
  `);
  const url = withDatabase(IT_PG_URL, name);
  const sql = postgres(url, { max: 4, onnotice: () => undefined });
  await sql.unsafe(`create schema if not exists auth; create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';`);
  for (const f of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    await sql.unsafe(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
  }
  if (opts.statusEnum) {
    await sql.unsafe(`
      create type public.client_status as enum (${LEGACY_STATUSES.map((s) => `'${s}'`).join(", ")});
      alter table public.clients alter column status drop default;
      alter table public.clients alter column status type public.client_status using status::public.client_status;
      alter table public.clients alter column status set default 'blueprint-submitted';
    `);
  }
  return {
    name,
    url,
    sql,
    drop: async () => {
      await sql.end({ timeout: 5 });
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end({ timeout: 5 });
    },
  };
}

// ── Sessions ────────────────────────────────────────────────────────────────

type Holder = { session: ConsultantSession | null; als: AsyncLocalStorage<ConsultantSession | null> };
const g = globalThis as unknown as { __consultantItSession?: Holder };
g.__consultantItSession ??= { session: null, als: new AsyncLocalStorage() };

/** Default session for subsequent requests. */
export function actAs(s: ConsultantSession | null): void {
  g.__consultantItSession!.session = s;
}

/** Run `fn` as `s` — safe for concurrent requests by different users. */
export function runAs<T>(s: ConsultantSession | null, fn: () => Promise<T>): Promise<T> {
  return g.__consultantItSession!.als.run(s, fn);
}

export type Member = { id: string; username: string; displayName: string };

export function consultantSession(m: Member): ConsultantSession {
  return { memberId: m.id, username: m.username, displayName: m.displayName, role: "sales_consultant", isManager: false, canCall: true, permissions: permissionsFor("sales_consultant") };
}
export function managerSession(m: Member): ConsultantSession {
  return { memberId: m.id, username: m.username, displayName: m.displayName, role: "agent_manager", isManager: true, canCall: true, permissions: permissionsFor("agent_manager") };
}
/** The legacy single-password admin: a manager with no member id (read-only). */
export function legacySession(): ConsultantSession {
  return { memberId: null, username: "admin", displayName: "admin", role: "super_admin", isManager: true, canCall: false, permissions: permissionsFor("super_admin") };
}

export async function insertMember(sql: Sql, username: string, role: string, fullName: string): Promise<Member> {
  const rows = await sql<{ id: string }[]>`
    insert into public.team_members (username, email, role, full_name)
    values (${username}, ${`${username}@example.test`}, ${role}, ${fullName})
    returning id::text
  `;
  return { id: rows[0].id, username, displayName: fullName };
}

// ── Requests ────────────────────────────────────────────────────────────────

export function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

export function jsonReq(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function sign(pathWithQuery: string, params: Record<string, string>, token = AUTH_TOKEN): string {
  return twilio.getExpectedTwilioSignature(token, `${PUBLIC_URL}${pathWithQuery}`, params);
}

/** A form-encoded Twilio webhook, signed like Twilio signs it (unless `signature` is given). */
export function twilioReq(pathWithQuery: string, params: Record<string, string>, signature?: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  const sig = signature === undefined ? sign(pathWithQuery, params) : signature;
  if (sig) headers["x-twilio-signature"] = sig;
  // The host Twilio reached us on is irrelevant: the signature is checked against PUBLIC_URL.
  return new Request(`http://internal.host${pathWithQuery}`, { method: "POST", headers, body: new URLSearchParams(params) });
}

export async function body<T = unknown>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

export function callSid(): string {
  return `CA${randomUUID().replace(/-/g, "")}`;
}
export function recordingSid(): string {
  return `RE${randomUUID().replace(/-/g, "")}`;
}

/** Deferred `after()` callbacks captured from next/server so tests can run them deliberately. */
type AfterHolder = { tasks: (() => unknown)[] };
const ga = globalThis as unknown as { __consultantItAfter?: AfterHolder };
ga.__consultantItAfter ??= { tasks: [] };
export const afterTasks = ga.__consultantItAfter;

export async function drainAfter(): Promise<void> {
  while (afterTasks.tasks.length) {
    const t = afterTasks.tasks.shift()!;
    await t();
  }
}
