import crypto from "crypto";
import type { Sql } from "postgres";
import type { AutomationRunRecord, WeeklyPipelineResult } from "./types";
import { closeDb, connectDb, ensureReportsTable, ensureWeeklyTables, insertAutomationRunDb } from "./db";
import { buildWeeklyEmail } from "./email";
import { sendTelegramSummary, sendWeeklyEmail } from "./delivery";
import { computeWeeklyMetrics, hasWeeklyReportForWindow, listActiveClients, utcWindow } from "./weekly";

function env(name: string) {
  return (process.env[name] || "").trim();
}

function isoNow() {
  return new Date().toISOString();
}

function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function sha256(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function triggerResearchAgent(client: unknown) {
  const url = env("RESEARCH_AGENT_WEBHOOK_URL");
  if (!url) throw new Error("RESEARCH_AGENT_WEBHOOK_URL is required to trigger research agent.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client }),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Research agent webhook failed: ${res.status} ${txt}`);
  try {
    return JSON.parse(txt);
  } catch {
    return { ok: true, raw: txt };
  }
}

function getCronTimezone() {
  return (process.env.WEEKLY_REPORTS_TZ || "").trim() || undefined;
}

function getWeekOfIsoDate(d = new Date()): string {
  // “week_of” is the date of the Tuesday for the current UTC week.
  const day = d.getDay(); // 0=Sun ... 2=Tue
  const diffToTue = 2 - day;
  const tue = new Date(d);
  tue.setHours(0, 0, 0, 0);
  tue.setDate(tue.getDate() + diffToTue);
  return tue.toISOString().slice(0, 10);
}

async function insertWeeklyReportRow(params: {
  db: Sql;
  id: string;
  client_id: string;
  client_name: string;
  created_at: string;
  week_of: string;
  metrics: unknown;
  email: { to: string; subject: string; html: string; resend_message_id?: string | null };
}) {
  await params.db.unsafe(
    `
    insert into reports (
      id, client_id, client_name,
      report_type, report_generated, created_at,
      source, report_markdown
    ) values (
      $1, $2, $3,
      'weekly-performance', true, $4,
      $5::jsonb, $6
    )
  `,
    [
      params.id,
      params.client_id,
      params.client_name,
      params.created_at,
      JSON.stringify({
        week_of: params.week_of,
        metrics: params.metrics,
        delivery: { channel: "email", to: params.email.to, resend_message_id: params.email.resend_message_id ?? null },
      }),
      params.email.html,
    ],
  );
}

export async function runWeeklyPipeline(params?: { schedule?: string }): Promise<WeeklyPipelineResult> {
  const started_at = isoNow();
  const runId = uid("run");
  const schedule = params?.schedule ?? "0 8 * * 2";

  const db = connectDb();
  if (!db) throw new Error("WEEKLY_PG_URL (or BRIEFING_PG_URL) is required for weekly automation.");
  await ensureWeeklyTables(db);
  await ensureReportsTable(db);

  const clients = await listActiveClients(db);
  const run: AutomationRunRecord = {
    id: runId,
    started_at,
    status: "failed",
    cron: { schedule, timezone: getCronTimezone() },
    summary: { clients_total: clients.length, clients_success: 0, clients_failed: 0 },
    errors: [],
  };

  const per_client: WeeklyPipelineResult["per_client"] = [];
  const week_of = getWeekOfIsoDate(new Date());

  try {
    const week = utcWindow(7, new Date());
    const prev_week = utcWindow(7, new Date(new Date(week.since_iso).getTime()));

    for (const client of clients) {
      try {
        if (!client.email) {
          run.summary.clients_failed += 1;
          run.errors?.push({ client_id: client.id, step: "delivery", message: "Client missing email; skipping." });
          per_client.push({ client_id: client.id, ok: false, error: "missing email" });
          continue;
        }

        const alreadySent = await hasWeeklyReportForWindow(db, client.id, week_of);
        if (alreadySent) {
          per_client.push({ client_id: client.id, ok: true, report_id: "duplicate-skip" });
          continue;
        }

        const metrics = await computeWeeklyMetrics({ db, client_id: client.id, week, prev_week });
        const { subject, html } = buildWeeklyEmail({ client_name: client.name, metrics });

        const sendOut = await sendWeeklyEmail({ to: client.email, subject, html });

        const reportId = `weekly_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        await insertWeeklyReportRow({
          db,
          id: reportId,
          client_id: client.id,
          client_name: client.name,
          created_at: isoNow(),
          week_of,
          metrics,
          email: { to: client.email, subject, html, resend_message_id: sendOut.message_id },
        });

        // Weekly delivery counts as "client activity" for churn/activity tracking.
        await db.unsafe(`update public.clients set last_active_at = now() where id = $1::uuid`, [client.id]);

        run.summary.clients_success += 1;
        per_client.push({ client_id: client.id, ok: true, report_id: reportId });
      } catch (e: any) {
        const msg = e instanceof Error ? e.message : String(e);
        run.summary.clients_failed += 1;
        run.errors?.push({ client_id: client.id, message: msg });
        per_client.push({ client_id: client.id, ok: false, error: msg });
      }
    }

    run.finished_at = isoNow();
    run.status =
      run.summary.clients_failed === 0 ? "success" : run.summary.clients_success > 0 ? "partial" : "failed";

    await insertAutomationRunDb(db, run);

    const errCount = run.errors?.length ?? 0;
    const summary = [
      `Weekly reports run (UTC Tue 08:00)`,
      `Sent: ${run.summary.clients_success}/${run.summary.clients_total}`,
      `Failed: ${run.summary.clients_failed}`,
      errCount ? `Errors: ${errCount}` : `Errors: 0`,
    ].join("\n");
    await sendTelegramSummary(summary);

    return { run, per_client };
  } finally {
    if (db) await closeDb(db);
  }
}

