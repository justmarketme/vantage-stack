#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import TelegramBot from "node-telegram-bot-api";
import postgres from "postgres";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

const repoRoot = process.cwd();

const DATA_DIR = join(repoRoot, "data");
const TASK_QUEUE_PATH = join(DATA_DIR, "telegram-orchestrator-task-queue.json");

function getTelegramBotToken(fallback?: string) {
  return (fallback ?? process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

function getDefaultChatId(fallback?: string) {
  return (fallback ?? process.env.TELEGRAM_DEFAULT_CHAT_ID ?? "").trim();
}

function env(name: string) {
  return (process.env[name] || "").trim();
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  try {
    const txt = await readFile(path, "utf-8");
    return JSON.parse(txt) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(path: string, value: unknown) {
  await ensureDataDir();
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

const CommandName = z.enum([
  "briefing",
  "client",
  "pipeline",
  "trigger_report",
  "upsells",
  "leads",
  "revenue",
  "tasks",
  "unknown",
]);

type ParsedCommand = {
  raw: string;
  command: z.infer<typeof CommandName>;
  args: string[];
  client_name?: string;
  client_id?: string;
};

export function parseTelegramCommand(textRaw: string): ParsedCommand {
  const raw = textRaw.trim();
  const [first, ...rest] = raw.split(/\s+/).filter(Boolean);
  const cmdToken = (first ?? "").trim();
  const cmd = cmdToken.startsWith("/") ? cmdToken.slice(1) : cmdToken;

  if (!cmd) return { raw, command: "unknown", args: [] };

  if (cmd === "briefing") return { raw, command: "briefing", args: rest };
  if (cmd === "pipeline") return { raw, command: "pipeline", args: rest };
  if (cmd === "upsells") return { raw, command: "upsells", args: rest };
  if (cmd === "leads") return { raw, command: "leads", args: rest };
  if (cmd === "revenue") return { raw, command: "revenue", args: rest };
  if (cmd === "tasks") return { raw, command: "tasks", args: rest };

  if (cmd === "client") {
    const client_name = rest.join(" ").trim();
    return { raw, command: "client", args: rest, client_name: client_name || undefined };
  }

  if (cmd === "trigger-report" || cmd === "trigger_report") {
    const client_id = (rest[0] ?? "").trim();
    return { raw, command: "trigger_report", args: rest, client_id: client_id || undefined };
  }

  return { raw, command: "unknown", args: rest };
}

const CrmQueryOperation = z.enum([
  "briefing_today",
  "client_by_name",
  "latest_report_for_client",
  "pipeline_kanban",
  "pending_upsells",
  "latest_leads",
  "revenue_snapshot",
  "tasks_due_today",
]);

const QueryCrmDataInput = z.object({
  operation: CrmQueryOperation,
  params: z.record(z.any()).optional(),
  pg_url: z.string().optional(),
  sql: z.record(z.string()).optional(),
  timezone: z.string().optional(),
});

function dbUrlFromEnvOrArg(arg?: string) {
  const direct = (arg || "").trim();
  if (direct) return direct;
  return env("BRIEFING_PG_URL") || env("REPORTS_PG_URL") || env("WEEKLY_PG_URL") || env("DELIVERY_PG_URL") || "";
}

function safeNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export async function queryCrmData(input: z.infer<typeof QueryCrmDataInput>) {
  const pgUrl = dbUrlFromEnvOrArg(input.pg_url);
  if (!pgUrl) throw new Error("BRIEFING_PG_URL (or REPORTS_PG_URL/WEEKLY_PG_URL) is required (or pass pg_url).");

  const timezone = (input.timezone || env("BRIEFING_TIMEZONE") || "UTC").trim() || "UTC";
  const sqlOverrides = input.sql ?? {};
  const db = postgres(pgUrl, { max: 5, prepare: false });

  try {
    const today = new Date().toISOString().slice(0, 10);

    if (input.operation === "briefing_today") {
      const q =
        sqlOverrides.briefing_today ||
        env("TELEGRAM_SQL_BRIEFING_TODAY") ||
        `select briefing_text::text as briefing_text, briefing_json as briefing_json, created_at::text as created_at
from briefings
where briefing_date = (current_date at time zone $1)
order by created_at desc
limit 1`;
      const rows = await db.unsafe(q, [timezone]);
      const r = rows?.[0] ?? null;
      return { date: today, briefing_text: r?.briefing_text ?? null, briefing_json: r?.briefing_json ?? null, created_at: r?.created_at ?? null };
    }

    if (input.operation === "client_by_name") {
      const name = String(input.params?.name ?? "").trim();
      if (!name) return { client: null };
      const q =
        sqlOverrides.client_by_name ||
        env("TELEGRAM_SQL_CLIENT_BY_NAME") ||
        `select id::text as id, name::text as name, industry::text as industry, status::text as status,
               (mrr_usd)::float8 as mrr_usd, notes::text as notes
from clients
where lower(name) = lower($1)
limit 1`;
      const rows = await db.unsafe(q, [name]);
      return { client: rows?.[0] ?? null };
    }

    if (input.operation === "latest_report_for_client") {
      const client_id = String(input.params?.client_id ?? "").trim();
      if (!client_id) return { report: null };
      const q =
        sqlOverrides.latest_report_for_client ||
        env("TELEGRAM_SQL_LATEST_REPORT_FOR_CLIENT") ||
        `select id::text as id, client_id::text as client_id, client_name::text as client_name,
               report_type::text as report_type, created_at::text as created_at,
               health_score::int as health_score, report_markdown::text as report_markdown
from reports
where client_id = $1 and report_generated = true
order by created_at desc
limit 1`;
      const rows = await db.unsafe(q, [client_id]);
      return { report: rows?.[0] ?? null };
    }

    if (input.operation === "pipeline_kanban") {
      const q =
        sqlOverrides.pipeline_kanban ||
        env("TELEGRAM_SQL_PIPELINE_KANBAN") ||
        `select stage::text as stage, id::text as id, name::text as name
from clients
where (status is null or status <> 'archived')
order by stage asc nulls last, name asc`;
      const rows = await db.unsafe(q, []);
      const byStage = new Map<string, Array<{ id: string; name: string }>>();
      for (const r of rows ?? []) {
        const stage = String(r.stage ?? "Unstaged");
        const list = byStage.get(stage) ?? [];
        list.push({ id: String(r.id ?? ""), name: String(r.name ?? "Unknown") });
        byStage.set(stage, list);
      }
      return { columns: Array.from(byStage.entries()).map(([stage, cards]) => ({ stage, cards })) };
    }

    if (input.operation === "pending_upsells") {
      const q =
        sqlOverrides.pending_upsells ||
        env("TELEGRAM_SQL_PENDING_UPSELLS") ||
        `select id::text as id, client_id::text as client_id, client_name::text as client_name,
               offer::text as offer, projected_mrr_usd::float8 as projected_mrr_usd, status::text as status
from upsell_opportunities
where status in ('ready','pending')
order by projected_mrr_usd desc nulls last
limit 50`;
      const rows = await db.unsafe(q, []);
      return { upsells: (rows ?? []).map((r: any) => ({ ...r, projected_mrr_usd: safeNumber(r.projected_mrr_usd) })) };
    }

    if (input.operation === "latest_leads") {
      const q =
        sqlOverrides.latest_leads ||
        env("TELEGRAM_SQL_LATEST_LEADS") ||
        `select id::text as id, name::text as name, created_at::text as created_at, source::text as source
from leads
order by created_at desc
limit 25`;
      const rows = await db.unsafe(q, []);
      return { leads: rows ?? [] };
    }

    if (input.operation === "revenue_snapshot") {
      const q =
        sqlOverrides.revenue_snapshot ||
        env("TELEGRAM_SQL_REVENUE_SNAPSHOT") ||
        `select (mrr_usd)::float8 as mrr_usd, (pipeline_value_usd)::float8 as pipeline_value_usd, updated_at::text as updated_at
from revenue_snapshots
order by updated_at desc nulls last
limit 1`;
      const rows = await db.unsafe(q, []);
      const r = rows?.[0] ?? null;
      return { revenue: r ? { ...r, mrr_usd: safeNumber(r.mrr_usd), pipeline_value_usd: safeNumber(r.pipeline_value_usd) } : null };
    }

    if (input.operation === "tasks_due_today") {
      const q =
        sqlOverrides.tasks_due_today ||
        env("TELEGRAM_SQL_TASKS_DUE_TODAY") ||
        `select id::text as id, title::text as title, owner::text as owner, due_date::text as due_date, priority::text as priority
from tasks
where due_date = (current_date at time zone $1)
  and (status is null or status not in ('done','completed'))
order by priority desc nulls last, id desc
limit 50`;
      const rows = await db.unsafe(q, [timezone]);
      return { tasks: rows ?? [] };
    }

    return { error: `Unsupported operation: ${input.operation}` };
  } finally {
    await db.end({ timeout: 5 });
  }
}

const TriggerAgentTaskInput = z.object({
  task: z.enum(["report_cycle"]),
  client_id: z.string().min(1),
  requested_by: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export async function triggerAgentTask(input: z.infer<typeof TriggerAgentTaskInput>) {
  const webhook = env("RESEARCH_AGENT_WEBHOOK_URL");
  if (webhook) {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: input.client_id, requested_by: input.requested_by, metadata: input.metadata ?? {} }),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Agent 2 webhook failed: ${res.status} ${text}`);
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
    return { kind: "webhook", webhook, response: json };
  }

  await ensureDataDir();
  const queue = await readJsonFile<any[]>(TASK_QUEUE_PATH, []);
  const record = {
    id: `task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    status: "queued",
    ...input,
  };
  queue.unshift(record);
  await writeJsonFile(TASK_QUEUE_PATH, queue);
  return { kind: "queue", task: record };
}

function formatUsd(n: unknown) {
  const num = typeof n === "number" && Number.isFinite(n) ? n : undefined;
  if (num === undefined) return "—";
  return `$${Math.round(num).toLocaleString("en-US")}`;
}

function escMd(s: string) {
  // Telegram "Markdown" (legacy) is forgiving; keep escaping minimal to avoid breaking formatting.
  return s.replace(/\*/g, "\\*").replace(/_/g, "\\_").replace(/`/g, "\\`");
}

type FormattedMessage = { text: string; parse_mode?: "Markdown" | "MarkdownV2" | "HTML"; disable_web_page_preview?: boolean };

function formatTelegramMessageForCommand(params: {
  cmd: ParsedCommand;
  crm?: any;
  report?: any;
  trigger?: any;
}): FormattedMessage {
  const { cmd } = params;

  if (cmd.command === "briefing") {
    const date = String(params.crm?.date ?? new Date().toISOString().slice(0, 10));
    const body = params.crm?.briefing_text ? String(params.crm.briefing_text) : "No morning briefing found for today yet.";
    return { text: `🗞️ *Morning briefing* (${escMd(date)})\n\n${body}`, parse_mode: "Markdown", disable_web_page_preview: true };
  }

  if (cmd.command === "client") {
    const client = params.crm?.client ?? null;
    if (!client) return { text: "I couldn’t find that client.\n\nTry: `/client Acme Co`", parse_mode: "Markdown" };

    const report = params.report?.report ?? null;

    const lines: string[] = [];
    lines.push(`👤 *${escMd(String(client.name ?? "Client"))}*`);
    lines.push(`• ID: \`${escMd(String(client.id ?? ""))}\``);
    if (client.industry) lines.push(`• Industry: ${escMd(String(client.industry))}`);
    if (client.status) lines.push(`• Status: ${escMd(String(client.status))}`);
    if (client.mrr_usd != null) lines.push(`• MRR: ${escMd(formatUsd(client.mrr_usd))}`);
    if (client.notes) lines.push(`• Notes: ${escMd(String(client.notes))}`);

    lines.push("");
    lines.push("🧾 *Latest report*");
    if (!report) {
      lines.push("• None on file yet.");
    } else {
      lines.push(`• Type: ${escMd(String(report.report_type ?? "report"))}`);
      lines.push(`• Created: ${escMd(String(report.created_at ?? ""))}`);
      if (typeof report.health_score === "number") lines.push(`• Health: ${report.health_score}/100`);
      if (report.report_markdown) {
        const excerpt = String(report.report_markdown).trim().slice(0, 1200);
        lines.push("");
        lines.push(excerpt.length < String(report.report_markdown).length ? `${excerpt}\n\n…(truncated)` : excerpt);
      }
    }

    return { text: lines.join("\n"), parse_mode: "Markdown", disable_web_page_preview: true };
  }

  if (cmd.command === "pipeline") {
    const cols = Array.isArray(params.crm?.columns) ? params.crm.columns : [];
    if (!cols.length) return { text: "📋 Pipeline is empty right now." };
    const lines: string[] = ["📋 *Pipeline*"];
    for (const col of cols) {
      const stage = String(col.stage ?? "Stage");
      const cards = Array.isArray(col.cards) ? col.cards : [];
      lines.push("");
      lines.push(`*${escMd(stage)}* (${cards.length})`);
      for (const c of cards.slice(0, 12)) lines.push(`- ${escMd(String(c.name ?? c.id ?? "Client"))}`);
      if (cards.length > 12) lines.push(`- …and ${cards.length - 12} more`);
    }
    return { text: lines.join("\n"), parse_mode: "Markdown" };
  }

  if (cmd.command === "upsells") {
    const upsells = Array.isArray(params.crm?.upsells) ? params.crm.upsells : [];
    if (!upsells.length) return { text: "✨ No pending upsells right now." };
    const total = upsells.reduce((acc: number, u: any) => acc + (typeof u.projected_mrr_usd === "number" ? u.projected_mrr_usd : 0), 0);
    const lines: string[] = ["✨ *Pending upsells*", ""];
    for (const u of upsells.slice(0, 15)) {
      const who = u.client_name ?? (u.client_id ? `Client ${u.client_id}` : "Client");
      lines.push(`- ${escMd(String(who))}: ${escMd(String(u.offer ?? "Offer"))} (${escMd(formatUsd(u.projected_mrr_usd))}/mo)`);
    }
    if (upsells.length > 15) lines.push(`\n…and ${upsells.length - 15} more`);
    lines.push(`\nProjected total: ${escMd(formatUsd(total))}/mo`);
    return { text: lines.join("\n"), parse_mode: "Markdown" };
  }

  if (cmd.command === "leads") {
    const leads = Array.isArray(params.crm?.leads) ? params.crm.leads : [];
    if (!leads.length) return { text: "🧲 No recent leads found." };
    const lines: string[] = ["🧲 *Latest leads*", ""];
    for (const l of leads.slice(0, 20)) {
      lines.push(`- ${escMd(String(l.name ?? "Lead"))}${l.created_at ? ` — ${escMd(String(l.created_at))}` : ""}`);
    }
    if (leads.length > 20) lines.push(`\n…and ${leads.length - 20} more`);
    return { text: lines.join("\n"), parse_mode: "Markdown" };
  }

  if (cmd.command === "revenue") {
    const rev = params.crm?.revenue ?? null;
    if (!rev) return { text: "💰 No revenue snapshot available yet." };
    return {
      text:
        `💰 *Revenue snapshot*\n\n` +
        `• MRR: ${escMd(formatUsd(rev.mrr_usd))}\n` +
        `• Pipeline value: ${escMd(formatUsd(rev.pipeline_value_usd))}\n` +
        (rev.updated_at ? `\nUpdated: ${escMd(String(rev.updated_at))}` : ""),
      parse_mode: "Markdown",
    };
  }

  if (cmd.command === "tasks") {
    const tasks = Array.isArray(params.crm?.tasks) ? params.crm.tasks : [];
    if (!tasks.length) return { text: "✅ No tasks due today." };
    const lines: string[] = ["🧠 *Tasks due today*", ""];
    for (const t of tasks.slice(0, 20)) {
      lines.push(`- ${escMd(String(t.title ?? "Task"))}${t.owner ? ` — ${escMd(String(t.owner))}` : ""}${t.priority ? ` — ${escMd(String(t.priority))}` : ""}`);
    }
    if (tasks.length > 20) lines.push(`\n…and ${tasks.length - 20} more`);
    return { text: lines.join("\n"), parse_mode: "Markdown" };
  }

  if (cmd.command === "trigger_report") {
    const kind = params.trigger?.kind ?? null;
    if (kind === "webhook") {
      return { text: `✅ Triggered Agent 2 research for client \`${escMd(cmd.client_id ?? "")}\`.\n\nStatus: webhook accepted.`, parse_mode: "Markdown" };
    }
    if (kind === "queue") {
      const task = params.trigger?.task;
      return {
        text: `✅ Queued report cycle for client \`${escMd(String(task?.client_id ?? cmd.client_id ?? ""))}\`.\n\nTask ID: \`${escMd(String(task?.id ?? ""))}\``,
        parse_mode: "Markdown",
      };
    }
    return { text: "Couldn’t trigger the report task. Try again." };
  }

  return {
    text:
      "🤖 I didn’t recognize that command.\n\nTry one of:\n" +
      "`/briefing`, `/client Acme Co`, `/pipeline`, `/trigger-report client_123`, `/upsells`, `/leads`, `/revenue`, `/tasks`",
    parse_mode: "Markdown",
  };
}

function errorToUserMessage(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return `⚠️ Something went wrong.\n\n${msg}\n\nIf this keeps happening, try again in a minute or check the server logs.`;
}

let botSingleton: TelegramBot | null = null;
let botInfo: { started_at: string; username?: string; id?: number; polling: boolean } | null = null;
let allowedChatIds: Set<string> | null = null;

function normalizeChatId(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

async function ensureBot(params: { bot_token?: string; polling?: boolean }) {
  const token = getTelegramBotToken(params.bot_token);
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required (or pass bot_token).");

  if (botSingleton) return botSingleton;

  botSingleton = new TelegramBot(token, { polling: params.polling ?? true });
  const me = await botSingleton.getMe().catch(() => null);
  botInfo = { started_at: new Date().toISOString(), username: me?.username, id: me?.id, polling: true };

  botSingleton.on("message", async (msg) => {
    try {
      const chatId = normalizeChatId(msg.chat?.id);
      if (!chatId) return;
      if (allowedChatIds && !allowedChatIds.has(chatId)) return;

      const text = (msg.text || "").trim();
      if (!text.startsWith("/")) return;

      const out = await handleUserInputInternal({
        text,
        chat_id: chatId,
        from_user: msg.from?.username ?? msg.from?.first_name ?? undefined,
        send: true,
      });

      // Fallback: if handler elected not to send, send now.
      if (out?.sent !== true && out?.message?.text) {
        if (!botSingleton) return;
        await botSingleton.sendMessage(chatId, out.message.text, {
          parse_mode: out.message.parse_mode,
          disable_web_page_preview: out.message.disable_web_page_preview,
        });
      }
    } catch (e) {
      try {
        const chatId = normalizeChatId((msg as any)?.chat?.id);
        if (chatId && botSingleton) await botSingleton.sendMessage(chatId, errorToUserMessage(e));
      } catch {
        // ignore
      }
    }
  });

  return botSingleton;
}

const CreateTelegramBotInput = z.object({
  bot_token: z.string().optional(),
  polling: z.boolean().optional().default(true),
  allowed_chat_ids: z.array(z.union([z.string(), z.number()])).optional(),
});

const RegisterCommandsInput = z.object({
  bot_token: z.string().optional(),
  commands: z
    .array(z.object({ command: z.string().min(1), description: z.string().min(1) }))
    .default([
      { command: "briefing", description: "Today’s morning briefing" },
      { command: "client", description: "Client profile + latest report: /client <name>" },
      { command: "pipeline", description: "Kanban view of clients by stage" },
      { command: "trigger-report", description: "Trigger a fresh report: /trigger-report <client-id>" },
      { command: "upsells", description: "Pending upsell opportunities" },
      { command: "leads", description: "Latest Apify lead scrape results" },
      { command: "revenue", description: "Current MRR + pipeline value" },
      { command: "tasks", description: "Tasks due today" },
    ]),
});

const HandleUserInput = z.object({
  text: z.string().min(1),
  chat_id: z.union([z.string().min(1), z.number().int()]).optional(),
  from_user: z.string().optional(),
  send: z.boolean().optional().default(false),
});

const TriggerAgentTasksInput = TriggerAgentTaskInput;

const SendFormattedMessagesInput = z.object({
  bot_token: z.string().optional(),
  chat_id: z.union([z.string().min(1), z.number().int()]).optional(),
  message: z.object({
    text: z.string().min(1),
    parse_mode: z.enum(["Markdown", "MarkdownV2", "HTML"]).optional(),
    disable_web_page_preview: z.boolean().optional(),
  }),
});

async function sendFormattedMessage(input: z.infer<typeof SendFormattedMessagesInput>) {
  const bot = await ensureBot({ bot_token: input.bot_token, polling: true });
  const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
  if (!chatId) throw new Error("chat_id is required (or set TELEGRAM_DEFAULT_CHAT_ID).");

  const sent = await bot.sendMessage(chatId, input.message.text, {
    parse_mode: input.message.parse_mode,
    disable_web_page_preview: input.message.disable_web_page_preview,
  });
  return sent;
}

export async function handleUserInputInternal(input: z.infer<typeof HandleUserInput>) {
  const cmd = parseTelegramCommand(input.text);

  if (cmd.command === "unknown") {
    const message = formatTelegramMessageForCommand({ cmd });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (chatId) {
        const bot = await ensureBot({ polling: true });
        await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
        return { parsed: cmd, message, sent: true };
      }
    }
    return { parsed: cmd, message, sent: false };
  }

  if (cmd.command === "briefing") {
    const crm = await queryCrmData({ operation: "briefing_today", params: {} });
    const message = formatTelegramMessageForCommand({ cmd, crm });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (!chatId) throw new Error("chat_id is required to send.");
      const bot = await ensureBot({ polling: true });
      await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
      return { parsed: cmd, crm, message, sent: true };
    }
    return { parsed: cmd, crm, message, sent: false };
  }

  if (cmd.command === "client") {
    const name = (cmd.client_name ?? "").trim();
    if (!name) {
      const message: FormattedMessage = { text: "Usage: `/client <name>`\n\nExample: `/client Acme Co`", parse_mode: "Markdown" };
      return { parsed: cmd, message, sent: false };
    }
    const crm = await queryCrmData({ operation: "client_by_name", params: { name } });
    const clientId = crm?.client?.id ? String(crm.client.id) : "";
    const report = clientId ? await queryCrmData({ operation: "latest_report_for_client", params: { client_id: clientId } }) : { report: null };
    const message = formatTelegramMessageForCommand({ cmd, crm, report });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (!chatId) throw new Error("chat_id is required to send.");
      const bot = await ensureBot({ polling: true });
      await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
      return { parsed: cmd, crm, report, message, sent: true };
    }
    return { parsed: cmd, crm, report, message, sent: false };
  }

  if (cmd.command === "pipeline") {
    const crm = await queryCrmData({ operation: "pipeline_kanban", params: {} });
    const message = formatTelegramMessageForCommand({ cmd, crm });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (!chatId) throw new Error("chat_id is required to send.");
      const bot = await ensureBot({ polling: true });
      await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
      return { parsed: cmd, crm, message, sent: true };
    }
    return { parsed: cmd, crm, message, sent: false };
  }

  if (cmd.command === "upsells") {
    const crm = await queryCrmData({ operation: "pending_upsells", params: {} });
    const message = formatTelegramMessageForCommand({ cmd, crm });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (!chatId) throw new Error("chat_id is required to send.");
      const bot = await ensureBot({ polling: true });
      await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
      return { parsed: cmd, crm, message, sent: true };
    }
    return { parsed: cmd, crm, message, sent: false };
  }

  if (cmd.command === "leads") {
    const crm = await queryCrmData({ operation: "latest_leads", params: {} });
    const message = formatTelegramMessageForCommand({ cmd, crm });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (!chatId) throw new Error("chat_id is required to send.");
      const bot = await ensureBot({ polling: true });
      await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
      return { parsed: cmd, crm, message, sent: true };
    }
    return { parsed: cmd, crm, message, sent: false };
  }

  if (cmd.command === "revenue") {
    const crm = await queryCrmData({ operation: "revenue_snapshot", params: {} });
    const message = formatTelegramMessageForCommand({ cmd, crm });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (!chatId) throw new Error("chat_id is required to send.");
      const bot = await ensureBot({ polling: true });
      await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
      return { parsed: cmd, crm, message, sent: true };
    }
    return { parsed: cmd, crm, message, sent: false };
  }

  if (cmd.command === "tasks") {
    const crm = await queryCrmData({ operation: "tasks_due_today", params: {} });
    const message = formatTelegramMessageForCommand({ cmd, crm });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (!chatId) throw new Error("chat_id is required to send.");
      const bot = await ensureBot({ polling: true });
      await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
      return { parsed: cmd, crm, message, sent: true };
    }
    return { parsed: cmd, crm, message, sent: false };
  }

  if (cmd.command === "trigger_report") {
    const clientId = (cmd.client_id ?? "").trim();
    if (!clientId) {
      const message: FormattedMessage = { text: "Usage: `/trigger-report <client-id>`", parse_mode: "Markdown" };
      return { parsed: cmd, message, sent: false };
    }
    const trigger = await triggerAgentTask({ task: "report_cycle", client_id: clientId, requested_by: input.from_user });
    const message = formatTelegramMessageForCommand({ cmd, trigger });
    if (input.send) {
      const chatId = normalizeChatId(input.chat_id ?? getDefaultChatId());
      if (!chatId) throw new Error("chat_id is required to send.");
      const bot = await ensureBot({ polling: true });
      await bot.sendMessage(chatId, message.text, { parse_mode: message.parse_mode, disable_web_page_preview: message.disable_web_page_preview });
      return { parsed: cmd, trigger, message, sent: true };
    }
    return { parsed: cmd, trigger, message, sent: false };
  }

  const message = formatTelegramMessageForCommand({ cmd });
  return { parsed: cmd, message, sent: false };
}

async function main() {
  const server = new Server(
    { name: "telegram-orchestrator", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "create-telegram-bot",
          description: "Create/start the Telegram bot (polling) and begin listening for slash commands.",
          inputSchema: {
            type: "object",
            properties: { bot_token: { type: "string" }, polling: { type: "boolean" }, allowed_chat_ids: { type: "array" } },
          },
        },
        {
          name: "register-commands",
          description: "Register slash commands via Telegram setMyCommands.",
          inputSchema: { type: "object", properties: { bot_token: { type: "string" }, commands: { type: "array" } } },
        },
        {
          name: "handle-user-input",
          description: "Route a user message (e.g. /briefing) to CRM queries + agent triggers, returning a formatted reply (and optionally sending it).",
          inputSchema: { type: "object", properties: { text: { type: "string" }, chat_id: { type: "string" }, from_user: { type: "string" }, send: { type: "boolean" } }, required: ["text"] },
        },
        {
          name: "query-crm-data",
          description: "Query the CRM database for briefing/client/pipeline/upsells/leads/revenue/tasks.",
          inputSchema: { type: "object", properties: { operation: { type: "string" }, params: { type: "object" }, pg_url: { type: "string" }, sql: { type: "object" }, timezone: { type: "string" } }, required: ["operation"] },
        },
        {
          name: "trigger-agent-tasks",
          description: "Trigger downstream agent workflows (Agent 2 research orchestrator) for a given client.",
          inputSchema: { type: "object", properties: { task: { type: "string" }, client_id: { type: "string" }, requested_by: { type: "string" }, metadata: { type: "object" } }, required: ["task", "client_id"] },
        },
        {
          name: "send-formatted-messages",
          description: "Send a formatted Telegram message using the running bot instance.",
          inputSchema: { type: "object", properties: { bot_token: { type: "string" }, chat_id: { type: "string" }, message: { type: "object" } }, required: ["message"] },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req: any) => {
    const { name, arguments: args } = req.params ?? {};

    try {
      if (name === "create-telegram-bot") {
        const parsed = CreateTelegramBotInput.parse(args ?? {});
        allowedChatIds = parsed.allowed_chat_ids ? new Set(parsed.allowed_chat_ids.map((x) => normalizeChatId(x)).filter(Boolean) as string[]) : null;
        const bot = await ensureBot({ bot_token: parsed.bot_token, polling: parsed.polling });
        const me = await bot.getMe().catch(() => null);
        const out = {
          ok: true,
          live: true,
          listening: true,
          username: me?.username ?? botInfo?.username ?? null,
          bot_id: me?.id ?? botInfo?.id ?? null,
          started_at: botInfo?.started_at ?? new Date().toISOString(),
          allowed_chat_ids: allowedChatIds ? Array.from(allowedChatIds) : null,
        };
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }

      if (name === "register-commands") {
        const parsed = RegisterCommandsInput.parse(args ?? {});
        const bot = await ensureBot({ bot_token: parsed.bot_token, polling: true });
        const out = await bot.setMyCommands(parsed.commands);
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, result: out, commands: parsed.commands }, null, 2) }] };
      }

      if (name === "handle-user-input") {
        const parsed = HandleUserInput.parse(args ?? {});
        const out = await handleUserInputInternal({
          ...parsed,
          chat_id: normalizeChatId(parsed.chat_id) ?? undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }

      if (name === "query-crm-data") {
        const parsed = QueryCrmDataInput.parse(args ?? {});
        const out = await queryCrmData(parsed);
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }

      if (name === "trigger-agent-tasks") {
        const parsed = TriggerAgentTasksInput.parse(args ?? {});
        const out = await triggerAgentTask(parsed);
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }

      if (name === "send-formatted-messages") {
        const parsed = SendFormattedMessagesInput.parse(args ?? {});
        const out = await sendFormattedMessage({
          ...parsed,
          chat_id: normalizeChatId(parsed.chat_id) ?? undefined,
        });
        return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
      }
    } catch (err) {
      const payload = { ok: false, error: err instanceof Error ? err.message : String(err) };
      return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

