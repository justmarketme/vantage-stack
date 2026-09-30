"use client";

import Link from "next/link";
import { memo, type ReactNode } from "react";
import { CalendarClock } from "lucide-react";
import type { Lead } from "../../lib/consultant/types";
import { HealthDot, healthEdge } from "./HealthDot";
import { StageChip } from "./StageChip";
import { cx, fmtDue, FOCUS, timeAgo } from "./utils";

/**
 * A lead in a list. The row body opens the workspace; the action slot (Call /
 * Claim) is a sibling, never nested inside the link. Health = left edge + dot + label.
 */
export const LeadRow = memo(function LeadRow({
  lead,
  action,
  showStage = true,
  showOwner = false,
}: {
  lead: Lead;
  action?: ReactNode;
  showStage?: boolean;
  showOwner?: boolean;
}) {
  const due = fmtDue(lead.nextActionAt);
  return (
    <li
      className={cx(
        "flex items-center gap-2 rounded-2xl border border-[--cp-border] border-l-[3px] bg-[--cp-surface] pr-3",
        healthEdge(lead.health),
      )}
    >
      <Link href={`/consultant/leads/${lead.id}`} className={cx("min-w-0 flex-1 rounded-2xl py-3 pl-3", FOCUS)}>
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-[--cp-text]">{lead.clinicName}</span>
          <HealthDot health={lead.health} compact />
        </span>
        <span className="mt-0.5 block truncate text-sm text-[--cp-muted]">
          {[lead.contactName, lead.city].filter(Boolean).join(" · ") || "No contact yet"}
          {showOwner && ` · ${lead.consultantName ?? "Unassigned"}`}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-2">
          {showStage && <StageChip stage={lead.salesStage} />}
          {due ? (
            <span className={cx("inline-flex items-center gap-1 text-xs", due.overdue ? "text-[--cp-risk]" : "text-[--cp-muted]")}>
              <CalendarClock size={13} aria-hidden />
              <span className="max-w-[14rem] truncate">{lead.nextAction ? `${lead.nextAction} · ` : ""}{due.label}</span>
            </span>
          ) : (
            <span className="text-xs text-[--cp-muted]">
              {lead.lastCallAt ? `Last call ${timeAgo(lead.lastCallAt)}` : lead.callCount === 0 ? "Never called" : ""}
            </span>
          )}
        </span>
      </Link>
      {action && <div className="shrink-0">{action}</div>}
    </li>
  );
});
