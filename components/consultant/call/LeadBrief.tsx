"use client";

import Link from "next/link";
import { memo } from "react";
import type { Lead } from "../../../lib/consultant/types";
import { HealthDot } from "../HealthDot";
import { StageChip } from "../StageChip";
import { buttonClass, SURFACE } from "../ui";
import { cx, fmtDue, fmtZar, timeAgo } from "../utils";

/** Desktop left column during a call: only what helps right now. */
export const LeadBrief = memo(function LeadBrief({ lead }: { lead: Lead | undefined }) {
  if (!lead) {
    return (
      <div className={cx(SURFACE, "space-y-3 p-4")} aria-busy>
        <div className="cp-skeleton h-5 w-2/3 rounded" />
        <div className="cp-skeleton h-4 w-1/2 rounded" />
        <div className="cp-skeleton h-16 w-full rounded-xl" />
      </div>
    );
  }
  const due = fmtDue(lead.nextActionAt);
  const rows: Array<[string, string | null]> = [
    ["Contact", [lead.contactName, lead.contactRole].filter(Boolean).join(" · ") || null],
    ["City", lead.city],
    ["Source", lead.source],
    ["Website", lead.website?.replace(/^https?:\/\//, "") ?? null],
    ["Value", lead.dealValue != null ? `${fmtZar(lead.dealValue)}/mo` : null],
    ["Last call", lead.lastCallAt ? timeAgo(lead.lastCallAt) : lead.callCount === 0 ? "First call" : null],
  ];
  return (
    <section aria-label="Clinic brief" className={cx(SURFACE, "cp-scroll-y h-full p-4")}>
      <div className="flex flex-wrap items-center gap-2">
        <StageChip stage={lead.salesStage} />
        <HealthDot health={lead.health} />
      </div>
      <dl className="mt-4 space-y-3">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-[--cp-muted]">{k}</dt>
              <dd className="mt-0.5 break-words text-sm text-[--cp-text]">{v}</dd>
            </div>
          ))}
      </dl>
      {(lead.nextAction || due) && (
        <div className="mt-4 rounded-xl bg-[--cp-surface-2] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[--cp-muted]">Planned for this call</p>
          <p className="mt-0.5 text-sm text-[--cp-text]">{lead.nextAction ?? "Follow up"}</p>
          {due && <p className={cx("text-xs", due.overdue ? "text-[--cp-risk]" : "text-[--cp-muted]")}>{due.label}</p>}
        </div>
      )}
      <Link href={`/consultant/leads/${lead.id}`} className={buttonClass("ghost", "md", "-ml-3 mt-4")}>
        Open clinic workspace
      </Link>
    </section>
  );
});
