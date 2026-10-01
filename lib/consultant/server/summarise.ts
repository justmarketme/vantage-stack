import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { Sql } from "postgres";
import { consultantConfig } from "../config";
import type { CallSummary, Speaker, SummaryStatus } from "../types";
import { AI, MESSAGES } from "./constants";
import { recordCallInCrm } from "./crmFeed";
import { summaryToMarkdown, transcriptForPrompt, formatDuration } from "./format";
import { errorTag, logError, txSql } from "./http";
import { upsertAiSummaryNote } from "./repo/notes";
import { CallSummarySchema, COACH_ALEX_SYSTEM } from "./summaryModel";

/**
 * Coach Alex post-call summarisation.
 *
 * Concurrency: work is CLAIMED with a single conditional UPDATE
 * (`summary_status in ('pending','failed')` → `processing`, attempts + 1, RETURNING), so the
 * `after()` hook in the completing webhook, the transcription-stopped hook, a manual re-run and
 * the cron sweep can all race and exactly one of them runs Claude. A crashed worker's
 * `processing` row is released by the sweep after TIMINGS.processingTimeoutSec.
 */

type Claimed = {
  id: string;
  client_id: string;
  answered_at: Date | null;
  ended_at: Date | null;
  duration_sec: number | null;
  clinic_name: string | null;
};

async function claim(db: Sql, callId: string, manual: boolean): Promise<Claimed | null> {
  const cfg = consultantConfig();
  const rows = await db<Claimed[]>`
    update public.consultant_calls k set
      summary_status = 'processing', summary_attempts = k.summary_attempts + 1, summary_error = null, updated_at = now()
    from public.clients c
    where k.id = ${callId}::uuid and c.id = k.client_id and k.ended_at is not null
      and (
        (k.summary_status in ('pending', 'failed') and (${manual} or k.summary_attempts < ${cfg.ai.maxSummaryAttempts}))
        or (${manual} and k.summary_status = 'skipped')
      )
    returning k.id::text, k.client_id::text, k.answered_at, k.ended_at, k.duration_sec,
      coalesce(nullif(c.company, ''), c.name)::text as clinic_name
  `;
  return rows[0] ?? null;
}

async function finish(
  db: Sql,
  callId: string,
  status: Exclude<SummaryStatus, "pending" | "processing">,
  reason: string | null,
  opts: { exhaust?: boolean } = {},
): Promise<void> {
  const cfg = consultantConfig();
  await db`
    update public.consultant_calls set
      summary_status = ${status}, summary_error = ${reason},
      summary_attempts = case when ${!!opts.exhaust} then greatest(summary_attempts, ${cfg.ai.maxSummaryAttempts}) else summary_attempts end,
      updated_at = now()
    where id = ${callId}::uuid and summary_status = 'processing'
  `;
}

/** Answered seconds: answer → end, else Twilio's duration once answered, else 0. */
export function talkSeconds(c: Pick<Claimed, "answered_at" | "ended_at" | "duration_sec">): number {
  if (!c.answered_at) return 0;
  if (c.ended_at) return Math.max(0, Math.round((new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) / 1000));
  return Math.max(0, c.duration_sec ?? 0);
}

/** The user turn: call facts + the speaker-labelled transcript. */
export function buildUserTurn(input: { clinicName: string | null; talkSec: number; transcript: string }): string {
  return [
    "Call facts:",
    `- Clinic: ${input.clinicName ?? "unknown"}`,
    `- Talk time: ${formatDuration(input.talkSec)}`,
    "",
    "Transcript:",
    "<transcript>",
    input.transcript,
    "</transcript>",
    "",
    "Review this call as Coach Alex and return the structured summary.",
  ].join("\n");
}

type Outcome = { ok: true; summary: CallSummary } | { ok: false; reason: string; exhaust?: boolean };

/** One Claude request. Never throws; maps every failure to a generic stored reason. */
export async function requestSummary(userTurn: string): Promise<Outcome> {
  const cfg = consultantConfig();
  const client = new Anthropic({ timeout: AI.requestTimeoutMs, maxRetries: AI.maxRetries });
  try {
    const res = await client.beta.messages.parse({
      model: cfg.ai.model,
      max_tokens: cfg.ai.maxTokens,
      betas: [AI.fallbackBeta],
      fallbacks: "default",
      output_config: { effort: AI.effort, format: betaZodOutputFormat(CallSummarySchema) },
      system: [{ type: "text", text: COACH_ALEX_SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userTurn }],
    });
    // stop_reason first: a refusal (even after the server-side fallback chain) or a truncated
    // response has no trustworthy content to read.
    if (res.stop_reason === "refusal") return { ok: false, reason: MESSAGES.summaryRefused, exhaust: true };
    if (res.stop_reason === "max_tokens") return { ok: false, reason: MESSAGES.summaryTruncated };
    const parsed = res.parsed_output ? CallSummarySchema.safeParse(res.parsed_output) : null;
    if (!parsed?.success) return { ok: false, reason: MESSAGES.summaryFailed };
    return { ok: true, summary: parsed.data };
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      // RateLimitError / InternalServerError / APIConnectionError / … — retry via the sweep.
      // AuthenticationError / PermissionDeniedError / BadRequestError are config or request
      // bugs; retrying won't help, so they exhaust the attempts.
      const permanent =
        e instanceof Anthropic.AuthenticationError ||
        e instanceof Anthropic.PermissionDeniedError ||
        e instanceof Anthropic.BadRequestError ||
        e instanceof Anthropic.NotFoundError;
      console.error("[consultant] summarise request failed", `${errorTag(e)}:${e.status ?? "-"}`);
      return { ok: false, reason: MESSAGES.summaryFailed, exhaust: permanent };
    }
    console.error("[consultant] summarise request failed", errorTag(e));
    return { ok: false, reason: MESSAGES.summaryFailed };
  }
}

/**
 * Summarise one ended call if it is claimable. Returns the resulting status, or null when
 * another worker owns it / it isn't eligible. Never throws.
 *
 * On success the summary JSON goes on the call row AND into the `ai_summary` note (unless a
 * human has already edited that note — then only the call row is updated).
 */
export async function summariseCall(db: Sql, callId: string, opts: { manual?: boolean } = {}): Promise<SummaryStatus | null> {
  const cfg = consultantConfig();
  let claimed: Claimed | null = null;
  try {
    claimed = await claim(db, callId, !!opts.manual);
    if (!claimed) return null;

    const talkSec = talkSeconds(claimed);
    if (talkSec < cfg.ai.minSummariseSec) {
      await finish(db, callId, "skipped", MESSAGES.summarySkippedShort);
      return "skipped";
    }
    if (!cfg.ai.apiKeyPresent) {
      await finish(db, callId, "skipped", MESSAGES.summarySkippedNoKey);
      return "skipped";
    }
    const segments = await db<{ seq: number; speaker: Speaker; text: string }[]>`
      select seq, speaker, text from public.consultant_call_segments where call_id = ${callId}::uuid order by seq
    `;
    const transcript = transcriptForPrompt(segments);
    if (!transcript) {
      await finish(db, callId, "skipped", MESSAGES.summarySkippedEmpty);
      return "skipped";
    }

    const outcome = await requestSummary(buildUserTurn({ clinicName: claimed.clinic_name, talkSec, transcript }));
    if (!outcome.ok) {
      await finish(db, callId, "failed", outcome.reason, { exhaust: outcome.exhaust });
      return "failed";
    }

    const body = summaryToMarkdown(outcome.summary);
    const clientId = claimed.client_id;
    await db.begin(async (tx) => {
      const t = txSql(tx);
      await t`
        update public.consultant_calls set
          summary = ${t.json(outcome.summary as never)}, summary_status = 'ready', summary_error = null, updated_at = now()
        where id = ${callId}::uuid
      `;
      await upsertAiSummaryNote(t, { clientId, callId, body });
    });
    await recordCallInCrm(db, callId).catch((e) => logError("summarise.crmFeed", e));
    return "ready";
  } catch (e) {
    logError("summarise", e);
    if (claimed) await finish(db, callId, "failed", MESSAGES.summaryFailed).catch(() => undefined);
    return "failed";
  }
}
