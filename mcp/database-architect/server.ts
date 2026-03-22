#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import postgres from "postgres";
import { readFile, readdir, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function dbUrlFromEnvOrArg(arg?: string) {
  const direct = (arg || "").trim();
  if (direct) return direct;
  return (
    env("DATABASE_URL") ||
    env("SUPABASE_DB_URL") ||
    env("REPORTS_PG_URL") ||
    env("BRIEFING_PG_URL") ||
    env("WEEKLY_PG_URL") ||
    ""
  );
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "migrations");
const repoRoot = join(__dirname, "..", "..");
const backupsDir = join(repoRoot, "backups");

async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".sql"))
    .map((e) => join(migrationsDir, e.name))
    .sort((a, b) => a.localeCompare(b));
}

async function runSql(db: ReturnType<typeof postgres>, sql: string) {
  const trimmed = (sql || "").trim();
  if (!trimmed) return { ok: true, statements: 0 };
  await db.unsafe(trimmed);
  return { ok: true, statements: null as null };
}

async function executeMigration(params: { pg_url?: string; sql?: string; migration_path?: string; run_all?: boolean }) {
  const url = dbUrlFromEnvOrArg(params.pg_url);
  if (!url) {
    throw new Error(
      "Database URL is required. Set DATABASE_URL (preferred) or SUPABASE_DB_URL, or pass pg_url (fallbacks: REPORTS_PG_URL / BRIEFING_PG_URL / WEEKLY_PG_URL).",
    );
  }

  const db = postgres(url, { max: 5, prepare: false });
  try {
    if (params.run_all) {
      const files = await listMigrationFiles();
      const applied: Array<{ file: string; bytes: number }> = [];
      for (const f of files) {
        const sql = await readFile(f, "utf-8");
        await runSql(db, sql);
        applied.push({ file: f.replace(/\\/g, "/"), bytes: Buffer.byteLength(sql, "utf-8") });
      }
      return { ok: true, applied };
    }

    if (params.migration_path) {
      const abs = params.migration_path.includes(":") ? params.migration_path : join(repoRoot, params.migration_path);
      const sql = await readFile(abs, "utf-8");
      await runSql(db, sql);
      return { ok: true, applied: [{ file: abs.replace(/\\/g, "/"), bytes: Buffer.byteLength(sql, "utf-8") }] };
    }

    if (typeof params.sql === "string") {
      await runSql(db, params.sql);
      return { ok: true, applied: [{ inline: true, bytes: Buffer.byteLength(params.sql, "utf-8") }] };
    }

    throw new Error("Provide one of: run_all=true, migration_path, or sql.");
  } finally {
    await db.end({ timeout: 5 });
  }
}

async function validateSchema(params: { pg_url?: string }) {
  const url = dbUrlFromEnvOrArg(params.pg_url);
  if (!url) throw new Error("DATABASE_URL (or SUPABASE_DB_URL) is required, or pass pg_url.");

  const db = postgres(url, { max: 5, prepare: false });
  try {
    const tables = ["clients", "reports", "campaigns", "tasks", "upsells", "events", "deals"] as const;

    // Use `= any($1::text[])` to reliably match against a text-array parameter.
    const tableRows = await db<Array<{ table_name: string }>>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any(${tables}::text[])
    `;
    const presentTables = new Set(tableRows.map((r) => r.table_name));

    const rlsRows = await db<Array<{ relname: string; relrowsecurity: boolean }>>`
      select c.relname, c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = any(${tables}::text[])
    `;
    const rls: Record<string, boolean> = {};
    for (const r of rlsRows) rls[r.relname] = r.relrowsecurity;

    const idxRows = await db<Array<{ tablename: string; indexname: string }>>`
      select tablename, indexname
      from pg_indexes
      where schemaname = 'public'
        and tablename = any(${tables}::text[])
    `;
    const indexesByTable: Record<string, string[]> = {};
    for (const r of idxRows) {
      indexesByTable[r.tablename] = indexesByTable[r.tablename] || [];
      indexesByTable[r.tablename]!.push(r.indexname);
    }

    // Policies are in `pg_policies`; this is a weak (but useful) signal that RLS policies exist.
    const policyRows = await db<Array<{ tablename: string; policyname: string }>>`
      select tablename, policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = any(${tables}::text[])
    `;
    const policiesByTable: Record<string, string[]> = {};
    for (const r of policyRows) {
      policiesByTable[r.tablename] = policiesByTable[r.tablename] || [];
      policiesByTable[r.tablename]!.push(r.policyname);
    }

    const missingTables = tables.filter((t) => !presentTables.has(t));
    return {
      ok: missingTables.length === 0,
      tables: tables.map((t) => ({
        name: t,
        exists: presentTables.has(t),
        rls_enabled: rls[t] ?? false,
        indexes: indexesByTable[t] ?? [],
        policies: policiesByTable[t] ?? [],
      })),
      missing_tables: missingTables,
    };
  } finally {
    await db.end({ timeout: 5 });
  }
}

function runCmd(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, shell: process.platform === "win32" });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function createSupabaseProject() {
  const accessToken = env("SUPABASE_ACCESS_TOKEN");
  const orgId = env("SUPABASE_ORG_ID");
  const name = env("SUPABASE_PROJECT_NAME") || "vantage-stack";
  const region = env("SUPABASE_REGION") || "us-east-1";

  if (!accessToken || !orgId) {
    return {
      ok: false,
      message:
        "Supabase project creation requires SUPABASE_ACCESS_TOKEN and SUPABASE_ORG_ID in the environment. (Schema migrations can still be executed with DATABASE_URL.)",
      required_env: ["SUPABASE_ACCESS_TOKEN", "SUPABASE_ORG_ID"],
      suggested_env: { SUPABASE_PROJECT_NAME: name, SUPABASE_REGION: region },
    };
  }

  // Best-effort: supabase CLI must be installed and authenticated via token.
  const cli = "supabase";
  const envForCli = { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken };

  const res = await runCmd(cli, ["projects", "create", name, "--org-id", orgId, "--region", region, "--json"], { env: envForCli });
  if (res.code !== 0) {
    return { ok: false, message: "Failed to create Supabase project via CLI.", command: `${cli} projects create ...`, stderr: res.stderr, stdout: res.stdout };
  }

  let parsed: any = null;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    parsed = { raw: res.stdout };
  }
  return { ok: true, project: parsed };
}

async function backupDatabase(params: { pg_url?: string; output_path?: string }) {
  const url = dbUrlFromEnvOrArg(params.pg_url);
  if (!url) throw new Error("DATABASE_URL (or SUPABASE_DB_URL) is required, or pass pg_url.");

  await mkdir(backupsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultOut = join(backupsDir, `vantage-stack-${ts}.dump`);
  const out = params.output_path
    ? (params.output_path.includes(":") ? params.output_path : join(repoRoot, params.output_path))
    : defaultOut;

  const res = await runCmd("pg_dump", ["--no-owner", "--no-privileges", "--format=c", "--file", out, url], { cwd: repoRoot });
  if (res.code !== 0) {
    return { ok: false, message: "pg_dump failed. Ensure PostgreSQL tools are installed and on PATH.", stderr: res.stderr, stdout: res.stdout };
  }
  return { ok: true, output_path: out.replace(/\\/g, "/") };
}

const ExecuteSqlMigrationInput = z.object({
  pg_url: z.string().optional(),
  sql: z.string().optional(),
  migration_path: z.string().optional(),
  run_all: z.boolean().optional(),
});

const ValidateSchemaInput = z.object({
  pg_url: z.string().optional(),
});

const BackupDatabaseInput = z.object({
  pg_url: z.string().optional(),
  output_path: z.string().optional(),
});

const server = new Server({ name: "database-architect", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create-supabase-project",
        description: "Best-effort helper to create a Supabase project via supabase CLI (requires env credentials).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "execute-sql-migration",
        description: "Execute SQL migrations (inline SQL, a migration file path, or run all bundled migrations in order).",
        inputSchema: zodToJsonSchema(ExecuteSqlMigrationInput),
      },
      {
        name: "set-row-level-security",
        description: "Apply the bundled RLS policy migration (002_rls_policies.sql).",
        inputSchema: zodToJsonSchema(ValidateSchemaInput),
      },
      {
        name: "create-indexes",
        description: "Apply the bundled indexes migration (003_indexes.sql).",
        inputSchema: zodToJsonSchema(ValidateSchemaInput),
      },
      {
        name: "validate-schema",
        description: "Validate required tables, RLS enabled, and indexes present.",
        inputSchema: zodToJsonSchema(ValidateSchemaInput),
      },
      {
        name: "backup-database",
        description: "Backup the database with pg_dump to ./backups (requires pg_dump on PATH).",
        inputSchema: zodToJsonSchema(BackupDatabaseInput),
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  if (name === "create-supabase-project") {
    const out = await createSupabaseProject();
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "execute-sql-migration") {
    const parsed = ExecuteSqlMigrationInput.parse(obj);
    const out = await executeMigration(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "set-row-level-security") {
    const parsed = ValidateSchemaInput.parse(obj);
    const out = await executeMigration({ pg_url: parsed.pg_url, migration_path: join(migrationsDir, "002_rls_policies.sql") });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "create-indexes") {
    const parsed = ValidateSchemaInput.parse(obj);
    const out = await executeMigration({ pg_url: parsed.pg_url, migration_path: join(migrationsDir, "003_indexes.sql") });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "validate-schema") {
    const parsed = ValidateSchemaInput.parse(obj);
    const out = await validateSchema({ pg_url: parsed.pg_url });
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "backup-database") {
    const parsed = BackupDatabaseInput.parse(obj);
    const out = await backupDatabase(parsed);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Missing migrations directory: ${migrationsDir}`);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

