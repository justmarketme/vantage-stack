"use client";

import { memo } from "react";
import { formatZar } from "../../../lib/consultant/client/format";
import type { FunnelMetrics } from "../../../lib/consultant/types";
import type { TeamFunnelMetrics } from "../wave2/data";
import { SURFACE } from "../ui";
import { cx } from "../utils";
import { num, pct } from "../wave2/parts";

type Row = FunnelMetrics & { consultantId?: string; name: string };

const COLS: { label: string; get: (r: Row) => string; numeric?: boolean }[] = [
  { label: "Dials", get: (r) => num(r.dials), numeric: true },
  { label: "Answered", get: (r) => num(r.connects), numeric: true },
  { label: "Booked", get: (r) => num(r.meetingsBooked), numeric: true },
  { label: "Held", get: (r) => num(r.meetingsHeld), numeric: true },
  { label: "No-show", get: (r) => num(r.noShows), numeric: true },
  { label: "Paid", get: (r) => num(r.paid), numeric: true },
  { label: "Paid ÷ answered", get: (r) => pct(r.rates.closeFromConnects, 1), numeric: true },
  { label: "Paid ÷ dials", get: (r) => pct(r.rates.closeFromDials, 1), numeric: true },
  { label: "Revenue", get: (r) => formatZar(r.revenuePaid), numeric: true },
  { label: "Pipeline", get: (r) => formatZar(r.pipelineValue), numeric: true },
  { label: "Velocity/day", get: (r) => (r.velocityPerDay != null ? formatZar(r.velocityPerDay) : "—"), numeric: true },
];

/**
 * Managers: every consultant's funnel side by side, team total last. A real
 * table (screen readers get row/column headers); scrolls sideways on phones
 * with the name column pinned.
 */
export const TeamTable = memo(function TeamTable({ data, target }: { data: TeamFunnelMetrics; target: number }) {
  const rows: Row[] = [...data.byConsultant].sort((a, b) => b.revenuePaid - a.revenuePaid);
  return (
    <div className={cx(SURFACE, "overflow-x-auto")}>
      <table className="w-full min-w-[880px] border-collapse text-sm">
        <caption className="sr-only">Team funnel by consultant. Close target {pct(target)} on answered calls.</caption>
        <thead>
          <tr className="border-b border-[--cp-border] text-left text-xs uppercase tracking-[0.1em] text-[--cp-muted]">
            <th scope="col" className="sticky left-0 bg-[--cp-surface] px-3 py-3 font-medium">
              Consultant
            </th>
            {COLS.map((c) => (
              <th key={c.label} scope="col" className="px-3 py-3 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLS.length + 1} className="px-3 py-6 text-center text-[--cp-muted]">
                No consultant activity in this period.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.consultantId} className="border-b border-[--cp-border] last:border-b-0">
              <th scope="row" className="sticky left-0 bg-[--cp-surface] px-3 py-2.5 text-left font-medium text-[--cp-text]">
                {r.name}
              </th>
              {COLS.map((c) => {
                const hit = c.label === "Paid ÷ answered" && r.rates.closeFromConnects != null && r.rates.closeFromConnects >= target;
                return (
                  <td key={c.label} className={cx("px-3 py-2.5 text-right tabular-nums", hit ? "text-[--cp-progress]" : "text-[--cp-text]")}>
                    {c.get(r)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[--cp-border-strong] bg-[--cp-surface-2]">
            <th scope="row" className="sticky left-0 bg-[--cp-surface-2] px-3 py-3 text-left font-medium text-[--cp-text]">
              Team
            </th>
            {COLS.map((c) => (
              <td key={c.label} className="px-3 py-3 text-right font-medium tabular-nums text-[--cp-text]">
                {c.get({ ...data.team, name: "Team" })}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
});
