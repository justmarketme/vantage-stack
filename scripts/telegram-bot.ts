#!/usr/bin/env node
import TelegramBot from "node-telegram-bot-api";
import postgres from "postgres";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function env(name: string): string {
  return (process.env[name] || "").trim();
}

function requiredEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`${name} is required (set it in .env.local)`);
  return v;
}

function isoDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function safeNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function fmtUsd(n: unknown) {
  const num = safeNumber(n);
  if (num === undefined) return "—";
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  return `$${Math.round(num).toLocaleString("en-US")}`;
}

const repoRoot = join(process.cwd());
const dataDir = join(repoRoot, "data");
const auditPath = join(dataDir, "telegram-audit.json");
const triggerQueuePath = join(dataDir, "telegram-orchestrator-task-queue.json");
const telegramHeartbeatPath = join(dataDir, "telegram-heartbeat.json");

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
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

async function writeTelegramHeartbeat(reason: string) {
  // Heartbeat is used by `/api/monitoring/telegram-heartbeat` so uptime monitors can detect bot outages
  // even when Telegram uses polling (no webhook).
  await writeJsonFile(telegramHeartbeatPath, { updated_at: new Date().toISOString(), reason });
}

async function logAudit(entry: {
  chat_id: number | string;
  user_id?: number;
  username?: string;
  command: string;
  request_text: string;
  response_text: string;
  ok: boolean;
  error?: string | null;
}) {
  const existing = await readJsonFile<any[]>(auditPath, []);
  existing.unshift({
    id: `audit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    ...entry,
  });
  await writeJsonFile(auditPath, existing.slice(0, 2000));
}

function pickBotToken() {
  return env("TELEGRAM_BOT_TOKEN");
}

function pickPgUrl() {
  return env("TELEGRAM_PG_URL") || env("DATABASE_URL") || env("BRIEFING_PG_URL");
}

function sqlOr(name: string, fallback: string) {
  return env(name) || fallback;
}

type Db = ReturnType<typeof postgres>;

function dbClient(): Db {
  const pgUrl = pickPgUrl();
  if (!pgUrl) throw new Error("TELEGRAM_PG_URL or DATABASE_URL is required.");
  return postgres(pgUrl, { max: 5, prepare: false });
}

async function fetchBriefingBits(db: Db, date: string) {
  const blueprintsSql = sqlOr(
    "TELEGRAM_SQL_TODAYS_BLUEPRINTS",
    `select id::text as id, name::text as name, created_at::timestamptz as created_at
from blueprint_submissions
where created_at::date = $1
order by created_at desc
limit 50`,
  );

  const redFlagsSql = sqlOr(
    "TELEGRAM_SQL_RED_FLAG_REPORTS",
    `select client_id::text as client_id, title::text as title, created_at::timestamptz as created_at, summary::text as summary
from reports
where red_flags = true
order by created_at desc
limit 20`,
  );

  const upsellsSql = sqlOr(
    "TELEGRAM_SQL_PENDING_UPSELLS",
    `select id::text as id, client_name::text as client_name, offer::text as offer, projected_revenue::float8 as projected_revenue
from upsells
where status = 'pending'
order by projected_revenue desc nulls last
limit 50`,
  );

  const tasksSql = sqlOr(
    "TELEGRAM_SQL_TASKS_DUE_TODAY",
    `select id::text as id, title::text as title, owner::text as owner, due_date::date as due_date, priority::text as priority
from tasks
where due_date = $1
order by priority desc nulls last
limit 50`,
  );

  const [blueprints, redFlags, upsells, tasks] = await Promise.all([
    db.unsafe(blueprintsSql, [date]),
    db.unsafe(redFlagsSql, []),
    db.unsafe(upsellsSql, []),
    db.unsafe(tasksSql, [date]),
  ]);

  return { blueprints, redFlags, upsells, tasks };
}

async function fetchClientBundle(db: Db, clientName: string) {
  const clientSql = sqlOr("TELEGRAM_SQL_CLIENT_BY_NAME", `select * from clients where lower(name) = lower($1) limit 1`);
  const reportSql = sqlOr(
    "TELEGRAM_SQL_LATEST_REPORT_FOR_CLIENT",
    `select * from reports where client_id = $1 order by created_at desc limit 1`,
  );

  const clients = await db.unsafe(clientSql, [clientName]);
  const client = clients?.[0] ?? null;
  if (!client) return { client: null, report: null };

  const reports = await db.unsafe(reportSql, [client.id]);
  const report = reports?.[0] ?? null;
  return { client, report };
}

async function fetchPipelineCounts(db: Db) {
  const sql = sqlOr(
    "TELEGRAM_SQL_PIPELINE_COUNTS",
    `select status::text as status, count(*)::int as count from clients group by status`,
  );
  const rows = await db.unsafe(sql, []);
  const counts: Record<string, number> = {};
  for (const r of rows ?? []) counts[String((r as any).status ?? "unknown")] = Number((r as any).count ?? 0);
  return counts;
}

async function fetchUpsells(db: Db) {
  const sql = sqlOr(
    "TELEGRAM_SQL_PENDING_UPSELLS",
    `select id::text as id, client_name::text as client_name, offer::text as offer, projected_revenue::float8 as projected_revenue
from upsells
where status = 'pending'
order by projected_revenue desc nulls last
limit 50`,
  );
  const rows = await db.unsafe(sql, []);
  const total = (rows ?? []).reduce((acc: number, r: any) => acc + (typeof r.projected_revenue === "number" ? r.projected_revenue : 0), 0);
  return { rows, total };
}

async function fetchLeadsToday(db: Db, date: string) {
  const sql = sqlOr("TELEGRAM_SQL_LEADS_TODAY", `select * from leads where created_at::date = $1 order by created_at desc limit 100`);
  const rows = await db.unsafe(sql, [date]);
  return rows ?? [];
}

async function fetchRevenue(db: Db) {
  const revenueSql = sqlOr("TELEGRAM_SQL_REVENUE_MTD", `select sum(amount_usd)::float8 as revenue_mtd_usd from transactions where created_at >= date_trunc('month', now())`);
  const mrrSql = sqlOr("TELEGRAM_SQL_MRR", `select sum(mrr_usd)::float8 as mrr_usd from clients where status = 'active-client'`);
  const pipelineSql = sqlOr(
    "TELEGRAM_SQL_PIPELINE_VALUE",
    `select sum(expected_value_usd)::float8 as pipeline_value_usd from deals where status in ('blueprint-submitted','report-sent','proposal-sent','upsell-sent')`,
  );
  const [revenueRows, mrrRows, pipelineRows] = await Promise.all([db.unsafe(revenueSql, []), db.unsafe(mrrSql, []), db.unsafe(pipelineSql, [])]);
  return {
    revenue_mtd_usd: revenueRows?.[0]?.revenue_mtd_usd ?? null,
    mrr_usd: mrrRows?.[0]?.mrr_usd ?? null,
    pipeline_value_usd: pipelineRows?.[0]?.pipeline_value_usd ?? null,
  };
}

async function queueTriggerReport(clientId: string, requestedBy?: string) {
  const mode = (env("TELEGRAM_TRIGGER_REPORT_MODE") || "queue").toLowerCase();
  if (mode === "noop") return { queued: false, mode };

  const queue = await readJsonFile<any[]>(triggerQueuePath, []);
  const record = {
    id: `task_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    status: "queued",
    task: "report_cycle",
    client_id: clientId,
    requested_by: requestedBy ?? null,
    metadata: { source: "telegram" },
  };
  queue.unshift(record);
  await writeJsonFile(triggerQueuePath, queue);
  return { queued: true, mode, task: record };
}

function actionKeyboard(actions: Array<{ text: string; data: string }>) {
  return {
    inline_keyboard: [actions.map((a) => ({ text: a.text, callback_data: a.data }))],
  };
}

function helpText() {
  return (
    "Try:\n" +
    "- /briefing\n" +
    "- /client Acme Co\n" +
    "- /pipeline\n" +
    "- /trigger-report client_123\n" +
    "- /upsells\n" +
    "- /leads\n" +
    "- /revenue\n" +
    "- /sop-approve <sop_version_id>"
  );
}

async function main() {
  const token = pickBotToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required.");

  await ensureDataDir();

  const bot = new TelegramBot(token, { polling: true });
  await writeTelegramHeartbeat("startup").catch(() => {});
  // Keep heartbeat fresh even if the bot is not receiving commands.
  setInterval(() => {
    writeTelegramHeartbeat("interval").catch(() => {});
  }, 60_000);

  bot.onText(/^\/briefing\b/i, async (msg) => {
    const chatId = msg.chat.id;
    const date = isoDate();
    let responseText = "";

    try {
      const db = dbClient();
      try {
        const { blueprints, redFlags, upsells, tasks } = await fetchBriefingBits(db, date);

        responseText =
          `🗞️ Morning briefing (${date})\n\n` +
          `• New blueprints today: ${blueprints.length}\n` +
          (blueprints.length ? `  - ${blueprints.slice(0, 5).map((b: any) => b.name ?? b.id ?? "Lead").join("\n  - ")}\n` : "") +
          `\n• Reports with red flags: ${redFlags.length}\n` +
          (redFlags.length ? `  - ${redFlags.slice(0, 5).map((r: any) => r.title ?? r.client_id ?? "Report").join("\n  - ")}\n` : "") +
          `\n• Pending upsells: ${upsells.length}\n` +
          (upsells.length
            ? `  - ${upsells
                .slice(0, 5)
                .map((u: any) => `${u.client_name ?? "Client"}: ${u.offer ?? "Upsell"} (${fmtUsd(u.projected_revenue)})`)
                .join("\n  - ")}\n`
            : "") +
          `\n• Tasks due today: ${tasks.length}\n` +
          (tasks.length ? `  - ${tasks.slice(0, 6).map((t: any) => t.title ?? t.id ?? "Task").join("\n  - ")}\n` : "");
      } finally {
        await db.end({ timeout: 5 });
      }

      await bot.sendMessage(chatId, responseText.trim(), {
        reply_markup: actionKeyboard([
          { text: "View pipeline", data: "cmd:/pipeline" },
          { text: "Show upsells", data: "cmd:/upsells" },
        ]),
        disable_web_page_preview: true,
      });

      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/briefing",
        request_text: msg.text ?? "/briefing",
        response_text: responseText.trim(),
        ok: true,
      });
    } catch (e: any) {
      const errText = `Sorry — I couldn’t load the briefing.\n\n${e?.message ?? String(e)}\n\n${helpText()}`;
      await bot.sendMessage(chatId, errText, { disable_web_page_preview: true });
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/briefing",
        request_text: msg.text ?? "/briefing",
        response_text: errText,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  });

  bot.onText(/^\/client\b(.*)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const rawName = (match?.[1] ?? "").trim();
    const name = rawName.replace(/^@[\w_]+\s*/g, "").trim();
    if (!name) {
      const t = "Who should I look up?\n\nExample: `/client Acme Co`";
      await bot.sendMessage(chatId, t, { parse_mode: "Markdown" });
      return;
    }

    try {
      const db = dbClient();
      let responseText = "";
      let clientId: string | null = null;
      try {
        const { client, report } = await fetchClientBundle(db, name);
        if (!client) {
          responseText = `I couldn’t find **${name}**.\n\nTry a different spelling, or send \`/pipeline\` to see active clients.`;
          await bot.sendMessage(chatId, responseText, { parse_mode: "Markdown" });
          await logAudit({
            chat_id: chatId,
            user_id: msg.from?.id,
            username: msg.from?.username,
            command: "/client",
            request_text: msg.text ?? `/client ${name}`,
            response_text: responseText,
            ok: true,
          });
          return;
        }

        clientId = String(client.id);
        const websiteScore = client.website_score ?? client.health_score ?? client.site_score ?? null;
        const traffic = client.traffic ?? client.monthly_traffic ?? null;
        const nextAction = client.next_recommended_action ?? client.next_action ?? null;

        responseText =
          `👤 ${client.name} (ID: ${client.id})\n\n` +
          (client.industry ? `• Industry: ${client.industry}\n` : "") +
          (client.status ? `• Status: ${client.status}\n` : "") +
          (websiteScore != null ? `• Website score: ${websiteScore}\n` : "") +
          (traffic != null ? `• Traffic: ${traffic}\n` : "") +
          (nextAction ? `• Next recommended action: ${nextAction}\n` : "") +
          `\n🧾 Latest report\n` +
          (report
            ? `• ${report.title ?? "Report"} — ${String(report.created_at ?? "").slice(0, 10)}\n` +
              (report.summary ? `• Summary: ${report.summary}\n` : "") +
              (report.red_flags === true ? `• ⚠️ Red flags: true\n` : "")
            : "• None on file yet.\n");
      } finally {
        await db.end({ timeout: 5 });
      }

      await bot.sendMessage(chatId, responseText.trim(), {
        reply_markup: actionKeyboard([
          { text: "Trigger report", data: `cmd:/trigger-report ${clientId ?? "client_id_here"}` },
          { text: "Revenue", data: "cmd:/revenue" },
        ]),
        disable_web_page_preview: true,
      });

      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/client",
        request_text: msg.text ?? `/client ${name}`,
        response_text: responseText.trim(),
        ok: true,
      });
    } catch (e: any) {
      const errText = `Sorry — I couldn’t load that client.\n\n${e?.message ?? String(e)}`;
      await bot.sendMessage(chatId, errText);
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/client",
        request_text: msg.text ?? `/client ${name}`,
        response_text: errText,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  });

  bot.onText(/^\/pipeline\b/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const db = dbClient();
      let counts: Record<string, number> = {};
      try {
        counts = await fetchPipelineCounts(db);
      } finally {
        await db.end({ timeout: 5 });
      }

      const stages = ["blueprint-submitted", "report-sent", "proposal-sent", "active-client", "upsell-sent"];
      const lines = ["📋 Pipeline status", ""];
      for (const s of stages) lines.push(`• ${s}: ${counts[s] ?? 0}`);
      const responseText = lines.join("\n");

      await bot.sendMessage(chatId, responseText, {
        reply_markup: actionKeyboard([
          { text: "Briefing", data: "cmd:/briefing" },
          { text: "Upsells", data: "cmd:/upsells" },
        ]),
      });
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/pipeline",
        request_text: msg.text ?? "/pipeline",
        response_text: responseText,
        ok: true,
      });
    } catch (e: any) {
      const errText = `Sorry — I couldn’t load pipeline status.\n\n${e?.message ?? String(e)}`;
      await bot.sendMessage(chatId, errText);
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/pipeline",
        request_text: msg.text ?? "/pipeline",
        response_text: errText,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  });

  bot.onText(/^\/trigger-report\b(.*)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const arg = (match?.[1] ?? "").trim();
    const clientId = arg.split(/\s+/)[0] || "";
    if (!clientId) {
      const t = "Which client?\n\nExample: `/trigger-report client_123`";
      await bot.sendMessage(chatId, t, { parse_mode: "Markdown" });
      return;
    }

    try {
      const out = await queueTriggerReport(clientId, msg.from?.username ? `@${msg.from.username}` : undefined);
      const responseText = out.queued
        ? `✅ Queued a fresh research+report cycle for **${clientId}**.\n\nTask: \`${out.task.id}\``
        : `✅ Acknowledged. Trigger mode is **${out.mode}**, so nothing was queued.`;

      await bot.sendMessage(chatId, responseText, {
        parse_mode: "Markdown",
        reply_markup: actionKeyboard([
          { text: "Pipeline", data: "cmd:/pipeline" },
          { text: "Revenue", data: "cmd:/revenue" },
        ]),
      });

      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/trigger-report",
        request_text: msg.text ?? `/trigger-report ${clientId}`,
        response_text: responseText,
        ok: true,
      });
    } catch (e: any) {
      const errText = `Sorry — I couldn’t trigger the report.\n\n${e?.message ?? String(e)}`;
      await bot.sendMessage(chatId, errText);
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/trigger-report",
        request_text: msg.text ?? `/trigger-report ${clientId}`,
        response_text: errText,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  });

  bot.onText(/^\/upsells\b/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const db = dbClient();
      let out: { rows: any[]; total: number };
      try {
        out = await fetchUpsells(db);
      } finally {
        await db.end({ timeout: 5 });
      }

      const rows = out.rows ?? [];
      const lines = ["✨ Pending upsells", ""];
      for (const u of rows.slice(0, 20)) {
        lines.push(`• ${u.client_name ?? "Client"} — ${u.offer ?? "Upsell"} (${fmtUsd(u.projected_revenue)}/mo)`);
      }
      if (!rows.length) lines.push("• None");
      lines.push("");
      lines.push(`Projected total: ${fmtUsd(out.total)}/mo`);
      const responseText = lines.join("\n");

      await bot.sendMessage(chatId, responseText, {
        reply_markup: actionKeyboard([
          { text: "Revenue", data: "cmd:/revenue" },
          { text: "Briefing", data: "cmd:/briefing" },
        ]),
      });
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/upsells",
        request_text: msg.text ?? "/upsells",
        response_text: responseText,
        ok: true,
      });
    } catch (e: any) {
      const errText = `Sorry — I couldn’t load upsells.\n\n${e?.message ?? String(e)}`;
      await bot.sendMessage(chatId, errText);
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/upsells",
        request_text: msg.text ?? "/upsells",
        response_text: errText,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  });

  bot.onText(/^\/leads\b/i, async (msg) => {
    const chatId = msg.chat.id;
    const date = isoDate();
    try {
      const db = dbClient();
      let rows: any[] = [];
      try {
        rows = await fetchLeadsToday(db, date);
      } finally {
        await db.end({ timeout: 5 });
      }

      const sample = rows.slice(0, 5);
      const lines = [`🧲 Leads scraped today (${date})`, "", `• New leads: ${rows.length}`, ""];
      if (!rows.length) {
        lines.push("• No leads found yet.");
      } else {
        lines.push("Sample:");
        for (const r of sample) {
          const name = r.name ?? r.company ?? r.title ?? "Lead";
          const email = r.email ?? r.contact_email ?? null;
          const url = r.url ?? r.website ?? null;
          lines.push(`• ${name}${email ? ` — ${email}` : ""}${url ? ` — ${url}` : ""}`);
        }
      }
      const responseText = lines.join("\n");

      await bot.sendMessage(chatId, responseText, {
        reply_markup: actionKeyboard([
          { text: "Briefing", data: "cmd:/briefing" },
          { text: "Pipeline", data: "cmd:/pipeline" },
        ]),
        disable_web_page_preview: true,
      });
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/leads",
        request_text: msg.text ?? "/leads",
        response_text: responseText,
        ok: true,
      });
    } catch (e: any) {
      const errText = `Sorry — I couldn’t load leads.\n\n${e?.message ?? String(e)}`;
      await bot.sendMessage(chatId, errText);
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/leads",
        request_text: msg.text ?? "/leads",
        response_text: errText,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  });

  bot.onText(/^\/revenue\b/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      const db = dbClient();
      let rev: any;
      try {
        rev = await fetchRevenue(db);
      } finally {
        await db.end({ timeout: 5 });
      }

      const responseText =
        `💰 Revenue\n\n` +
        `• MTD revenue: ${fmtUsd(rev.revenue_mtd_usd)}\n` +
        `• MRR: ${fmtUsd(rev.mrr_usd)}\n` +
        `• Pipeline value: ${fmtUsd(rev.pipeline_value_usd)}\n\n` +
        "Want this broken down by client or offer?";

      await bot.sendMessage(chatId, responseText, {
        reply_markup: actionKeyboard([
          { text: "Upsells", data: "cmd:/upsells" },
          { text: "Pipeline", data: "cmd:/pipeline" },
        ]),
      });
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/revenue",
        request_text: msg.text ?? "/revenue",
        response_text: responseText,
        ok: true,
      });
    } catch (e: any) {
      const errText = `Sorry — I couldn’t load revenue.\n\n${e?.message ?? String(e)}`;
      await bot.sendMessage(chatId, errText);
      await logAudit({
        chat_id: chatId,
        user_id: msg.from?.id,
        username: msg.from?.username,
        command: "/revenue",
        request_text: msg.text ?? "/revenue",
        response_text: errText,
        ok: false,
        error: e?.message ?? String(e),
      });
    }
  });

  bot.onText(/^\/sop-approve\b(.*)$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const arg = (match?.[1] ?? "").trim();
    const versionId = arg.split(/\s+/)[0] || "";

    if (!versionId) {
      await bot.sendMessage(chatId, "Usage: `/sop-approve <sop_version_id>`", { parse_mode: "Markdown" });
      return;
    }

    try {
      const db = dbClient();
      try {
        const out = await db.unsafe(
          `
          update public.sop_versions
          set
            status = 'approved',
            changed_by = $2,
            changed_at = now()
          where id = $1
          returning id::text as id, project_id::text as project_id, version_number::float8 as version_number
        `,
          [versionId, msg.from?.username ? `@${msg.from.username}` : msg.from?.username ?? "telegram-user"],
        );

        const row = out?.[0] ?? null;
        if (!row) {
          await bot.sendMessage(chatId, `No SOP version found for id: \`${versionId}\``, { parse_mode: "Markdown" });
          return;
        }

        const responseText = `✅ Approved SOP change.\n\n` + `Version: v${Number(row.version_number ?? 0)}\n` + `SOP Project: ${row.project_id}`;
        await bot.sendMessage(chatId, responseText, { disable_web_page_preview: true });
      } finally {
        await db.end({ timeout: 5 });
      }
    } catch (e: any) {
      const errText = `Sorry — couldn’t approve SOP version.\n\n${e?.message ?? String(e)}`;
      await bot.sendMessage(chatId, errText, { disable_web_page_preview: true });
    }
  });

  bot.on("callback_query", async (q) => {
    const chatId = q.message?.chat.id;
    const data = String(q.data ?? "");
    if (!chatId) return;
    if (!data.startsWith("cmd:")) return;
    const cmd = data.slice("cmd:".length);

    try {
      await bot.answerCallbackQuery(q.id);
    } catch {
      // ignore
    }

    // Re-inject as a message to reuse handlers.
    await bot.sendMessage(chatId, cmd, { disable_web_page_preview: true });
  });

  bot.onText(/^\/start\b/i, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, `Hey — I’m VantageStack control.\n\n${helpText()}`, { disable_web_page_preview: true });
  });

  bot.onText(/^\/help\b/i, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(chatId, helpText(), { disable_web_page_preview: true });
  });

  // Catch-all for unknown slash commands
  bot.onText(/^\/([a-zA-Z0-9_-]+)\b/i, async (msg, match) => {
    const cmd = String(match?.[1] ?? "");
    const known = new Set(["briefing", "client", "pipeline", "trigger-report", "upsells", "leads", "revenue", "sop-approve", "start", "help"]);
    if (known.has(cmd)) return;
    const chatId = msg.chat.id;
    const t = `I don’t recognize \`/${cmd}\`.\n\n${helpText()}`;
    await bot.sendMessage(chatId, t, { parse_mode: "Markdown" });
    await logAudit({
      chat_id: chatId,
      user_id: msg.from?.id,
      username: msg.from?.username,
      command: `/${cmd}`,
      request_text: msg.text ?? `/${cmd}`,
      response_text: t,
      ok: true,
    });
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

