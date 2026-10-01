"use client";

import { memo } from "react";
import { ChevronDown } from "lucide-react";
import { formatZar } from "../../../lib/consultant/client/format";
import type { Leaderboard, LeaderboardRow } from "../../../lib/consultant/types";
import { SURFACE } from "../ui";
import { cx, FOCUS } from "../utils";
import { Chip, num, pct } from "../wave2/parts";

const COLS: { label: string; get: (r: LeaderboardRow) => string }[] = [
  { label: "Points", get: (r) => num(r.points) },
  { label: "Revenue paid", get: (r) => formatZar(r.revenuePaid) },
  { label: "Paid deals", get: (r) => num(r.dealsPaid) },
  { label: "Commission", get: (r) => formatZar(r.commission) },
  { label: "Dials", get: (r) => num(r.dials) },
  { label: "Answered", get: (r) => num(r.connects) },
  { label: "Booked", get: (r) => num(r.meetingsBooked) },
  { label: "Held", get: (r) => num(r.meetingsHeld) },
  { label: "Paid ÷ answered", get: (r) => pct(r.closeFromConnects, 1) },
  { label: "Paid ÷ dials", get: (r) => pct(r.closeFromDials, 1) },
];

function tierChips(r: LeaderboardRow) {
  const got = r.tiers.filter((t) => t.achieved);
  if (!got.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {got.map((t) => (
        <Chip key={t.tier} tone="progress" className="px-2 py-0.5 text-[11px]">
          {t.tier === "tier1_monthly_achiever" ? "T1" : t.tier === "tier2_high_performer" ? "T2" : "T3"}
          <span className="sr-only"> {t.label}</span>
        </Chip>
      ))}
    </span>
  );
}

/**
 * Every metric for every consultant, commission included (Decision 5). Desktop
 * gets the full table; phones get a ranked list where each row expands to the
 * full breakdown (progressive disclosure). The signed-in consultant is marked.
 */
export const LeaderboardTable = memo(function LeaderboardTable({ board, meId }: { board: Leaderboard; meId: string | null }) {
  const primary = board.rankedBy === "revenue" ? COLS[1] : COLS[0];
  return (
    <>
      {/* Phones / tablets */}
      <ol className="space-y-2 lg:hidden" aria-label="Leaderboard">
        {board.rows.map((r) => {
          const mine = r.consultantId === meId;
          return (
            <li key={r.consultantId} className={cx(SURFACE, mine && "border-[--cp-accent]")}>
              <details className="group">
                <summary className={cx("flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3", FOCUS)}>
                  <span className="w-7 text-center font-heading text-lg tabular-nums text-[--cp-muted]">{r.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[--cp-text]">
                      {r.name}
                      {mine && <span className="ml-1.5 text-xs text-[--cp-accent-text]">you</span>}
                    </span>
                    <span className="block text-xs text-[--cp-muted]">Commission {formatZar(r.commission)}</span>
                  </span>
                  {tierChips(r)}
                  <span className="text-right">
                    <span className="block font-heading tabular-nums text-[--cp-text]">{primary.get(r)}</span>
                    <span className="block text-[11px] text-[--cp-muted]">{primary.label.toLowerCase()}</span>
                  </span>
                  <ChevronDown size={16} aria-hidden className="shrink-0 text-[--cp-muted] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[--cp-border] px-4 py-3 text-sm">
                  {COLS.map((c) => (
                    <div key={c.label} className="flex justify-between gap-2">
                      <dt className="text-[--cp-muted]">{c.label}</dt>
                      <dd className="tabular-nums text-[--cp-text]">{c.get(r)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </li>
          );
        })}
      </ol>

      {/* Desktop */}
      <div className={cx(SURFACE, "hidden overflow-x-auto lg:block")}>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Leaderboard ranked by {board.rankedBy}. Every metric is visible to every consultant, including commission.
          </caption>
          <thead>
            <tr className="border-b border-[--cp-border] text-left text-xs uppercase tracking-[0.1em] text-[--cp-muted]">
              <th scope="col" className="px-3 py-3 text-right font-medium">
                #
              </th>
              <th scope="col" className="px-3 py-3 font-medium">
                Consultant
              </th>
              {COLS.map((c) => (
                <th key={c.label} scope="col" className={cx("px-3 py-3 text-right font-medium", c === primary && "text-[--cp-text]")}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {board.rows.map((r) => {
              const mine = r.consultantId === meId;
              return (
                <tr key={r.consultantId} aria-current={mine ? "true" : undefined} className={cx("border-b border-[--cp-border] last:border-b-0", mine && "bg-[--cp-accent-soft]")}>
                  <td className="px-3 py-2.5 text-right font-heading tabular-nums text-[--cp-muted]">{r.rank}</td>
                  <th scope="row" className="px-3 py-2.5 text-left font-medium text-[--cp-text]">
                    <span className="flex items-center gap-2">
                      {r.name}
                      {mine && <span className="text-xs font-normal text-[--cp-accent-text]">you</span>}
                      {tierChips(r)}
                    </span>
                  </th>
                  {COLS.map((c) => (
                    <td key={c.label} className={cx("px-3 py-2.5 text-right tabular-nums", c === primary ? "font-medium text-[--cp-text]" : "text-[--cp-text]")}>
                      {c.get(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
});
