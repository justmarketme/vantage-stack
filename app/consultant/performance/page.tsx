"use client";

import { useState } from "react";
import { useGamificationSettings } from "../../../hooks/consultant/useGamificationSettings";
import { useGoals } from "../../../hooks/consultant/useGoals";
import { useMetrics } from "../../../hooks/consultant/useMetrics";
import { PERIODS, type Period } from "../../../lib/consultant/types";
import { useMe } from "../../../components/consultant/MeProvider";
import { Calculator } from "../../../components/consultant/performance/Calculator";
import { FunnelBars, HeadlineRatios, MoneyStats } from "../../../components/consultant/performance/Funnel";
import { TeamTable } from "../../../components/consultant/performance/TeamTable";
import { PageHeader, SectionTitle, Skeleton } from "../../../components/consultant/ui";
import { can, LoadError, PERIOD_LABELS, Segmented } from "../../../components/consultant/wave2/parts";

/** Default close target until settings load (mirrors cfg.gamificationDefaults.closeTargetFromConnects). */
const DEFAULT_CLOSE_TARGET = 0.3;

/**
 * Performance: the whole funnel, the two headline ratios against target, the
 * money, and the calculator. Managers also see the team table (Norman:
 * role-based view — consultants never get a table of other people's funnels
 * here; the leaderboard is the shared view).
 */
export default function PerformancePage() {
  const { me } = useMe();
  const [period, setPeriod] = useState<Period>("month");
  const settings = useGamificationSettings();
  const target = settings.data?.closeTargetFromConnects ?? DEFAULT_CLOSE_TARGET;
  const seesTeam = !!me?.isManager || can(me, "view_team_performance");
  const hasOwnNumbers = !!me?.memberId;

  return (
    <div className="space-y-6">
      <PageHeader title="Performance" subtitle="A sale counts when it's paid." />
      <Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} labels={PERIOD_LABELS} />

      {!me ? (
        <Skeleton className="h-[420px] rounded-2xl" />
      ) : (
        <>
          {hasOwnNumbers && <OwnPerformance period={period} target={target} />}
          {seesTeam && <TeamPerformance period={period} target={target} />}
          {!hasOwnNumbers && !seesTeam && (
            <p className="text-sm text-[--cp-muted]">Sign in with your consultant account to see your numbers.</p>
          )}
        </>
      )}
    </div>
  );
}

/** The signed-in consultant's funnel + the calculator (mounted only for consultants). */
function OwnPerformance({ period, target }: { period: Period; target: number }) {
  const funnel = useMetrics(period);
  const quarter = useMetrics("quarter"); // the calculator's "actual" rates
  const goals = useGoals();

  return (
    <>
      <div aria-live="polite" aria-busy={funnel.loading} className="space-y-6">
        {funnel.loading ? (
          <div className="space-y-3" role="status" aria-label="Loading your numbers">
            <div className="grid gap-3 sm:grid-cols-2">
              <Skeleton className="h-[128px] rounded-2xl" />
              <Skeleton className="h-[128px] rounded-2xl" />
            </div>
            <Skeleton className="h-[330px] rounded-2xl" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-[92px] rounded-2xl" />
              ))}
            </div>
          </div>
        ) : funnel.error && !funnel.data ? (
          <LoadError error={funnel.error} onRetry={() => void funnel.refresh()} />
        ) : funnel.data ? (
          <>
            <section aria-labelledby="ratios-h">
              <SectionTitle>
                <span id="ratios-h">Close ratio</span>
              </SectionTitle>
              <HeadlineRatios m={funnel.data} target={target} />
            </section>
            <section aria-labelledby="funnel-h">
              <SectionTitle>
                <span id="funnel-h">Funnel</span>
              </SectionTitle>
              {funnel.data.dials === 0 ? (
                <p className="rounded-2xl border border-dashed border-[--cp-border-strong] px-5 py-6 text-center text-sm text-[--cp-muted]">
                  No dials {period === "today" ? "yet today" : `this ${PERIOD_LABELS[period].toLowerCase()}`}. The funnel fills in as you call.
                </p>
              ) : (
                <FunnelBars m={funnel.data} />
              )}
            </section>
            <section aria-labelledby="money-h">
              <SectionTitle>
                <span id="money-h">Money &amp; pipeline</span>
              </SectionTitle>
              <MoneyStats m={funnel.data} />
            </section>
          </>
        ) : null}
      </div>
      <Calculator actuals={quarter.data} goals={goals.data} closeTarget={target} />
    </>
  );
}

/** Managers / Acquisition & Creative: every consultant side by side. */
function TeamPerformance({ period, target }: { period: Period; target: number }) {
  const team = useMetrics(period, "team");
  return (
    <section aria-labelledby="team-h">
      <SectionTitle>
        <span id="team-h">Team · {PERIOD_LABELS[period]}</span>
      </SectionTitle>
      <div aria-live="polite">
        {team.loading ? (
          <Skeleton className="h-[280px] rounded-2xl" />
        ) : team.error && !team.data ? (
          <LoadError error={team.error} onRetry={() => void team.refresh()} />
        ) : team.data ? (
          <TeamTable data={team.data} target={target} />
        ) : null}
      </div>
    </section>
  );
}
