#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";
import postgres from "postgres";
import { validateBlueprintSubmission } from "../../lib/blueprint/validation";
import { parseTelegramCommand } from "../telegram-orchestrator/server";

const execFileAsync = promisify(execFile);

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

async function runCmd(command: string, args: string[]) {
  const out = await execFileAsync(command, args, { cwd: process.cwd(), windowsHide: true });
  return { stdout: out.stdout ?? "", stderr: out.stderr ?? "" };
}

async function readLatestReport() {
  const p = `${process.cwd()}\\data\\qa\\test-report.json`;
  const txt = await readFile(p, "utf-8");
  return JSON.parse(txt);
}

const RunTestsInput = z.object({
  scope: z.enum(["unit", "integration", "e2e", "critical"]).default("critical"),
});

const ValidateApiResponsesInput = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).default("GET"),
  expected_status: z.number().int().min(100).max(599).default(200),
  required_keys: z.array(z.string()).default([]),
  body_json: z.any().optional(),
});

const TestDatabaseQueriesInput = z.object({
  pg_url: z.string().min(1),
  sql: z.string().min(1),
  params: z.array(z.any()).default([]),
  expect_rows_min: z.number().int().min(0).default(0),
});

const SimulateFormSubmissionsInput = z.object({
  blueprint_submission: z.any(),
});

const CheckEmailDeliveryInput = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
  dry_run: z.boolean().default(true),
});

const ValidateWhatsappSendingInput = z.object({
  to_e164: z.string().min(6),
  body: z.string().min(1),
  from_whatsapp: z.string().optional(),
});

const TestTelegramCommandsInput = z.object({
  text: z.string().min(1),
});

const server = new Server({ name: "qa-engineer", version: "0.1.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      { name: "run-unit-tests", description: "Run Jest unit tests + generate QA report artifact.", inputSchema: RunTestsInput },
      { name: "run-integration-tests", description: "Run Jest integration tests + generate QA report artifact.", inputSchema: RunTestsInput },
      { name: "validate-api-responses", description: "Call an HTTP endpoint and validate required keys in JSON response.", inputSchema: ValidateApiResponsesInput },
      { name: "test-database-queries", description: "Run a SQL query against Postgres and assert minimum row count.", inputSchema: TestDatabaseQueriesInput },
      { name: "simulate-form-submissions", description: "Validate a blueprint submission payload using the shared schema.", inputSchema: SimulateFormSubmissionsInput },
      { name: "check-email-delivery", description: "Validate email payload (and optionally send if dry_run=false).", inputSchema: CheckEmailDeliveryInput },
      { name: "validate-whatsapp-sending", description: "Validate WhatsApp payload shape (E.164 + body + optional from).", inputSchema: ValidateWhatsappSendingInput },
      { name: "test-telegram-commands", description: "Parse a Telegram slash command and return the structured command object.", inputSchema: TestTelegramCommandsInput },
      { name: "generate-test-report", description: "Return the latest QA test report artifact (data/qa/test-report.json).", inputSchema: { type: "object", properties: {} } },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Json;
  const obj = asObject(args) ?? {};

  if (name === "run-unit-tests") {
    const parsed = RunTestsInput.parse({ ...obj, scope: "unit" });
    await runCmd("npm", ["run", `test:${parsed.scope}`, "--silent"]);
    const report = await readLatestReport();
    return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
  }

  if (name === "run-integration-tests") {
    const parsed = RunTestsInput.parse({ ...obj, scope: "integration" });
    await runCmd("npm", ["run", `test:${parsed.scope}`, "--silent"]);
    const report = await readLatestReport();
    return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
  }

  if (name === "validate-api-responses") {
    const parsed = ValidateApiResponsesInput.parse(obj);
    const res = await fetch(parsed.url, {
      method: parsed.method,
      headers: parsed.body_json ? { "Content-Type": "application/json" } : undefined,
      body: parsed.body_json ? JSON.stringify(parsed.body_json) : undefined,
    });
    const status = res.status;
    const txt = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(txt);
    } catch {
      json = null;
    }
    const missing = parsed.required_keys.filter((k) => !(json && typeof json === "object" && k in json));
    const ok = status === parsed.expected_status && missing.length === 0;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok, status, expected_status: parsed.expected_status, missing_keys: missing, json }, null, 2),
        },
      ],
    };
  }

  if (name === "test-database-queries") {
    const parsed = TestDatabaseQueriesInput.parse(obj);
    const db = postgres(parsed.pg_url, { max: 3, prepare: false });
    try {
      const rows = await db.unsafe(parsed.sql, parsed.params);
      const ok = Array.isArray(rows) && rows.length >= parsed.expect_rows_min;
      return { content: [{ type: "text", text: JSON.stringify({ ok, rows_count: rows?.length ?? 0, sample: rows?.[0] ?? null }, null, 2) }] };
    } finally {
      await db.end({ timeout: 5 });
    }
  }

  if (name === "simulate-form-submissions") {
    const parsed = SimulateFormSubmissionsInput.parse(obj);
    const out = validateBlueprintSubmission(parsed.blueprint_submission);
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "check-email-delivery") {
    const parsed = CheckEmailDeliveryInput.parse(obj);
    const out = {
      ok: true,
      dry_run: parsed.dry_run,
      to: parsed.to,
      subject: parsed.subject,
      html_len: parsed.html.length,
      note: parsed.dry_run ? "Validated only (dry_run=true)." : "Sending is handled by delivery-coordinator MCP.",
    };
    return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
  }

  if (name === "validate-whatsapp-sending") {
    const parsed = ValidateWhatsappSendingInput.parse(obj);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { ok: true, to: parsed.to_e164, from: parsed.from_whatsapp ?? null, body_len: parsed.body.length },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "test-telegram-commands") {
    const parsed = TestTelegramCommandsInput.parse(obj);
    const cmd = parseTelegramCommand(parsed.text);
    return { content: [{ type: "text", text: JSON.stringify(cmd, null, 2) }] };
  }

  if (name === "generate-test-report") {
    const report = await readLatestReport();
    return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

