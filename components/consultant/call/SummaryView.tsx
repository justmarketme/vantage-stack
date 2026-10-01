"use client";

import { memo } from "react";
import { CircleCheck, CircleDashed, CircleX, Lightbulb, Sparkles } from "lucide-react";
import { NEPQ_STAGES, SALES_STAGE_LABELS, type CallSummary } from "../../../lib/consultant/types";
import { SURFACE } from "../ui";
import { cx, DISPOSITION_LABELS, NEPQ_LABELS } from "../utils";

function Block({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx(SURFACE, "p-4", className)}>
      <h2 className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">{title}</h2>
      {children}
    </section>
  );
}

/** Coach Alex's read of the call: summary, objections, NEPQ checklist, coaching. */
export const SummaryView = memo(function SummaryView({ summary }: { summary: CallSummary }) {
  const reached = new Map(summary.nepqStages.map((s) => [s.stage, s]));
  const handled = summary.objections.filter((o) => o.handled).length;
  return (
    <div className="space-y-4">
      <section className={cx(SURFACE, "cp-edge-guide p-4")}>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[--cp-coach]">
          <Sparkles size={15} aria-hidden /> Coach Alex summary
          <span className="ml-auto text-xs font-normal text-[--cp-muted]">Sentiment: {summary.sentiment}</span>
        </h2>
        <p className="text-[15px] leading-relaxed text-[--cp-text]">{summary.summary}</p>
        {summary.keyPoints.length > 0 && (
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[--cp-text]">
            {summary.keyPoints.map((k, i) => (
              <li key={i}>{k}</li>
            ))}
          </ul>
        )}
        {(summary.recommendedStage || summary.recommendedDisposition) && (
          <p className="mt-3 text-sm text-[--cp-muted]">
            Suggested:{" "}
            {[
              summary.recommendedDisposition && DISPOSITION_LABELS[summary.recommendedDisposition],
              summary.recommendedStage && `move to ${SALES_STAGE_LABELS[summary.recommendedStage]}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title={`Objections · ${handled}/${summary.objections.length} handled`}>
          {summary.objections.length === 0 ? (
            <p className="text-sm text-[--cp-muted]">No objections came up.</p>
          ) : (
            <ul className="space-y-3">
              {summary.objections.map((o, i) => (
                <li key={i} className="rounded-xl bg-[--cp-surface-2] p-3">
                  <p className="flex items-start gap-2 text-sm font-medium text-[--cp-text]">
                    {o.handled ? (
                      <CircleCheck size={16} className="mt-0.5 shrink-0 text-[--cp-progress]" aria-label="Handled" />
                    ) : (
                      <CircleX size={16} className="mt-0.5 shrink-0 text-[--cp-risk]" aria-label="Missed" />
                    )}
                    <span>
                      {o.objection}
                      <span className="sr-only">{o.handled ? " — handled" : " — missed"}</span>
                    </span>
                  </p>
                  {o.quote && <p className="mt-1 pl-6 text-sm italic text-[--cp-muted]">“{o.quote}”</p>}
                  {o.betterResponse && (
                    <p className="mt-2 pl-6 text-sm text-[--cp-text]">
                      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[--cp-coach]">Try instead · </span>
                      {o.betterResponse}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title="NEPQ checklist">
          <ol className="space-y-2">
            {NEPQ_STAGES.map((s) => {
              const r = reached.get(s);
              return (
                <li key={s} className="flex items-start gap-2 text-sm">
                  {r?.reached ? (
                    <CircleCheck size={16} className="mt-0.5 shrink-0 text-[--cp-progress]" aria-hidden />
                  ) : (
                    <CircleDashed size={16} className="mt-0.5 shrink-0 text-[--cp-muted]" aria-hidden />
                  )}
                  <span>
                    <span className={r?.reached ? "text-[--cp-text]" : "text-[--cp-muted]"}>{NEPQ_LABELS[s]}</span>
                    <span className="sr-only">{r?.reached ? " — reached" : " — not reached"}</span>
                    {r?.note && <span className="block text-xs text-[--cp-muted]">{r.note}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </Block>
      </div>

      {(summary.coachingTips.length > 0 || summary.nextSteps.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.coachingTips.length > 0 && (
            <Block title="Coaching tips">
              <ul className="space-y-2">
                {summary.coachingTips.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm text-[--cp-text]">
                    <Lightbulb size={16} className="mt-0.5 shrink-0 text-[--cp-coach]" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </Block>
          )}
          {summary.nextSteps.length > 0 && (
            <Block title="Next steps">
              <ul className="list-disc space-y-1 pl-5 text-sm text-[--cp-text]">
                {summary.nextSteps.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </Block>
          )}
        </div>
      )}
    </div>
  );
});
