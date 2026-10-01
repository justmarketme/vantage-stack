import {
  NEPQ_STAGES,
  SALES_STAGE_LABELS,
  type CallDisposition,
  type CallStatus,
  type CallSummary,
  type NepqStage,
  type SalesStage,
  type Speaker,
} from "../types";
import { CRM_FEED } from "./constants";

/** Pure formatting shared by the CRM feed, the summariser and its tests. */

const NEPQ_LABELS: Record<NepqStage, string> = {
  connection: "Connection",
  situation: "Situation",
  problem_awareness: "Problem awareness",
  solution_awareness: "Solution awareness",
  consequence: "Consequence",
  qualifying: "Qualifying",
  transition: "Transition",
  commitment: "Commitment",
};

const DISPOSITION_LABELS: Record<CallDisposition, string> = {
  no_answer: "No answer",
  voicemail: "Voicemail",
  gatekeeper: "Gatekeeper",
  callback: "Callback",
  not_interested: "Not interested",
  discovery_booked: "Discovery booked",
  demo_booked: "Demo booked",
  wrong_number: "Wrong number",
};

export function dispositionLabel(d: CallDisposition): string {
  return DISPOSITION_LABELS[d];
}

export function formatDuration(sec: number | null | undefined): string {
  const s = Math.max(0, Math.round(sec ?? 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${String(r).padStart(2, "0")}s` : `${r}s`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** Subject + preview for the CRM `client_communications` row of a call. Preview = the summary when ready. */
export function callCommunication(call: {
  status: CallStatus;
  disposition: CallDisposition | null;
  talkSec: number;
  summary: CallSummary | null;
}): { subject: string; preview: string } {
  const parts = ["Call", formatDuration(call.talkSec)];
  if (call.disposition) parts.push(dispositionLabel(call.disposition));
  else if (call.status === "failed") parts.push("Failed");
  const subject = parts.join(" · ");
  const preview = call.summary?.summary?.trim() || subject;
  return { subject, preview: truncate(preview, CRM_FEED.previewMaxChars) };
}

/** `deals.proposal_status` that mirrors a Clinics sales stage. */
export function dealStatusForStage(stage: SalesStage): string {
  // A paid deal is still an accepted proposal (payment itself lives in deals.paid_at).
  if (stage === "won" || stage === "paid") return CRM_FEED.dealStatus.won;
  if (stage === "proposal") return CRM_FEED.dealStatus.proposal;
  if (stage === "lost") return CRM_FEED.dealStatus.lost;
  return CRM_FEED.dealStatus.open;
}

const SPEAKER_LABELS: Record<Speaker, string> = { consultant: "Consultant", prospect: "Clinic" };

/** Transcript as the user turn for Coach Alex: one labelled line per final utterance, in seq order. */
export function transcriptForPrompt(segments: { seq: number; speaker: Speaker; text: string }[]): string {
  return [...segments]
    .sort((a, b) => a.seq - b.seq)
    .map((s) => `[${s.seq}] ${SPEAKER_LABELS[s.speaker]}: ${s.text.replace(/\s+/g, " ").trim()}`)
    .filter((line) => !/:\s*$/.test(line))
    .join("\n");
}

function bullets(items: string[]): string[] {
  return items.map((i) => i.trim()).filter(Boolean).map((i) => `- ${i}`);
}

/** The editable `ai_summary` note body: readable markdown of a CallSummary. */
export function summaryToMarkdown(s: CallSummary): string {
  const out: string[] = ["## Summary", s.summary.trim()];

  const key = bullets(s.keyPoints);
  if (key.length) out.push("", "## Key points", ...key);

  if (s.objections.length) {
    out.push("", "## Objections");
    for (const o of s.objections) {
      out.push(`- **${o.objection.trim()}** — ${o.handled ? "handled" : "not handled"}`);
      if (o.quote) out.push(`  > "${o.quote.trim()}"`);
      if (o.betterResponse) out.push(`  - Better response: ${o.betterResponse.trim()}`);
    }
  }

  const reached = s.nepqStages.filter((n) => n.reached).map((n) => n.stage);
  if (s.nepqStages.length) {
    const ordered = [...NEPQ_STAGES].filter((st) => s.nepqStages.some((n) => n.stage === st));
    out.push("", "## NEPQ stages");
    for (const st of ordered) {
      const n = s.nepqStages.find((x) => x.stage === st)!;
      out.push(`- [${reached.includes(st) ? "x" : " "}] ${NEPQ_LABELS[st]}${n.note ? ` — ${n.note.trim()}` : ""}`);
    }
  }

  const next = bullets(s.nextSteps);
  if (next.length) out.push("", "## Next steps", ...next);

  const tips = bullets(s.coachingTips);
  if (tips.length) out.push("", "## Coaching tips", ...tips);

  const rec: string[] = [];
  if (s.recommendedStage) rec.push(`- Stage: ${SALES_STAGE_LABELS[s.recommendedStage]}`);
  if (s.recommendedDisposition) rec.push(`- Disposition: ${dispositionLabel(s.recommendedDisposition)}`);
  rec.push(`- Sentiment: ${s.sentiment}`);
  out.push("", "## Recommendation", ...rec);

  const ex = s.extracted;
  const facts: string[] = [];
  if (ex.decisionMaker) facts.push(`- Decision maker: ${ex.decisionMaker}`);
  if (ex.email) facts.push(`- Email: ${ex.email}`);
  if (ex.website) facts.push(`- Website: ${ex.website}`);
  facts.push(...bullets(ex.painPoints).map((p) => p.replace(/^- /, "- Pain point: ")));
  if (facts.length) out.push("", "## Captured details", ...facts);

  return out.join("\n");
}
