"use client";

import Link from "next/link";
import { memo, type ReactNode } from "react";
import { SALES_STAGE_LABELS, type Lead, type SalesStage } from "../../lib/consultant/types";
import { HealthDot, healthEdge } from "./HealthDot";
import { cx, fmtDue, fmtZar, FOCUS } from "./utils";

/** Desktop pipeline column. Cards carry health on the left edge + labelled dot. */
export const KanbanColumn = memo(function KanbanColumn({
  stage,
  leads,
  renderAction,
  showOwner,
}: {
  stage: SalesStage;
  leads: Lead[];
  renderAction?: (lead: Lead) => ReactNode;
  showOwner?: boolean;
}) {
  const headingId = `col-${stage}`;
  return (
    <section aria-labelledby={headingId} className="flex w-[264px] shrink-0 flex-col ">
      <header className="flex items-center justify-between px-1 pb-2">
        <h2 id={headingId} className={cx("font-heading text-sm font-medium", stage === "won" ? "text-[--cp-progress]" : "text-[--cp-text]")}>
          {SALES_STAGE_LABELS[stage]}
        </h2>
        <span className="rounded-full bg-[--cp-surface-2] px-2 py-0.5 text-xs text-[--cp-muted]">{leads.length}</span>
      </header>
      <ul className="flex flex-col gap-2">
        {leads.length === 0 && (
          <li className="rounded-2xl border border-dashed border-[--cp-border] px-3 py-6 text-center text-xs text-[--cp-muted]">
            No clinics
          </li>
        )}
        {leads.map((l) => {
          const due = fmtDue(l.nextActionAt);
          const value = fmtZar(l.dealValue);
          return (
            <li
              key={l.id}
              className={cx("rounded-2xl border border-[--cp-border] border-l-[3px] bg-[--cp-surface]", healthEdge(l.health))}
            >
              <Link href={`/consultant/leads/${l.id}`} className={cx("block rounded-2xl p-3", FOCUS)}>
                <span className="block truncate font-medium text-[--cp-text]">{l.clinicName}</span>
                <span className="mt-0.5 block truncate text-xs text-[--cp-muted]">
                  {[l.contactName, l.city].filter(Boolean).join(" · ") || "No contact yet"}
                </span>
                <span className="mt-2 flex items-center justify-between gap-2">
                  <HealthDot health={l.health} />
                  {value && <span className="text-xs text-[--cp-text]">{value}/mo</span>}
                </span>
                {due && (
                  <span className={cx("mt-1 block truncate text-xs", due.overdue ? "text-[--cp-risk]" : "text-[--cp-muted]")}>
                    {l.nextAction ? `${l.nextAction} · ` : ""}
                    {due.label}
                  </span>
                )}
                {showOwner && <span className="mt-1 block truncate text-xs text-[--cp-muted]">{l.consultantName ?? "Unassigned"}</span>}
              </Link>
              {renderAction && <div className="flex justify-end px-3 pb-3">{renderAction(l)}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
});
