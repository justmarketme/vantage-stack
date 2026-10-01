"use client";

import { useState } from "react";
import { Radio } from "lucide-react";
import { useLeaderboard } from "../../../hooks/consultant/useLeaderboard";
import { formatSastTime } from "../../../lib/consultant/client/format";
import { PERIODS, type Period } from "../../../lib/consultant/types";
import { LeaderboardTable } from "../../../components/consultant/leaderboard/LeaderboardTable";
import { MyRewards } from "../../../components/consultant/leaderboard/MyRewards";
import { useMe } from "../../../components/consultant/MeProvider";
import { EmptyState, PageHeader, Skeleton, SkeletonList } from "../../../components/consultant/ui";
import { LoadError, PERIOD_LABELS, Segmented } from "../../../components/consultant/wave2/parts";

type RankBy = "points" | "revenue";
const RANK_LABELS: Record<RankBy, string> = { points: "Points", revenue: "Revenue" };

/**
 * Leaderboard (Fogg: Motivation + visible reward). Live: the server nudges on
 * any metric-affecting change and the list refetches (polling backstop).
 * Every metric is visible to everyone, commission included (Decision 5).
 */
export default function LeaderboardPage() {
  const { me } = useMe();
  const [period, setPeriod] = useState<Period>("month");
  const [rankBy, setRankBy] = useState<RankBy>("points");
  const board = useLeaderboard(period, rankBy);
  const meId = me?.memberId ?? null;
  const myRow = board.data?.rows.find((r) => r.consultantId === meId);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leaderboard"
        subtitle={
          board.data ? (
            <span className="inline-flex items-center gap-1.5">
              {board.realtime === "live" && <Radio size={13} aria-hidden className="text-[--cp-progress]" />}
              {board.realtime === "live" ? "Live" : "Updated"} · {formatSastTime(board.data.generatedAt)}
            </span>
          ) : (
            " "
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        <Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} labels={PERIOD_LABELS} />
        <Segmented label="Rank by" options={["points", "revenue"] as const} value={rankBy} onChange={setRankBy} labels={RANK_LABELS} />
      </div>

      {board.loading ? (
        <div className="space-y-4" role="status" aria-label="Loading leaderboard">
          {meId && <Skeleton className="h-[330px] rounded-2xl" />}
          <SkeletonList rows={6} rowClass="h-16" />
        </div>
      ) : board.error && !board.data ? (
        <LoadError error={board.error} onRetry={() => void board.refresh()} />
      ) : board.data ? (
        <>
          {myRow && <MyRewards row={myRow} memberId={meId} />}
          <section aria-labelledby="board-h">
            <h2 id="board-h" className="sr-only">
              Rankings
            </h2>
            {/* aria-live on a wrapper with only the rank summary, so a nudge doesn't re-read the whole table. */}
            <p aria-live="polite" className="sr-only">
              {myRow ? `You are ranked ${myRow.rank} of ${board.data.rows.length}.` : `${board.data.rows.length} consultants ranked.`}
            </p>
            {board.data.rows.length === 0 ? (
              <EmptyState title="No activity yet" body="The board fills up as the team dials. First call wins the top spot." />
            ) : (
              <LeaderboardTable board={board.data} meId={meId} />
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
