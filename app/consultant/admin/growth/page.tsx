"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useMetrics } from "../../../../hooks/consultant/useMetrics";
import { useGamificationSettings } from "../../../../hooks/consultant/useGamificationSettings";
import { formatZar } from "../../../../lib/consultant/client/format";
import { PERIODS, type Period } from "../../../../lib/consultant/types";
import { GamificationEditor } from "../../../../components/consultant/admin/GamificationEditor";
import { RewardsQueue } from "../../../../components/consultant/admin/RewardsQueue";
import { useMe } from "../../../../components/consultant/MeProvider";
import { TeamTable } from "../../../../components/consultant/performance/TeamTable";
import { buttonClass, PageHeader, SectionTitle, Skeleton } from "../../../../components/consultant/ui";
import { can, LoadError, NoAccess, num, pct, PERIOD_LABELS, Segmented, Stat } from "../../../../components/consultant/wave2/parts";

const DEFAULT_CLOSE_TARGET = 0.3;

/**
 * Acquisition & Creative Direction: pipeline velocity + team funnel
 * (`view_team_performance`), gamification settings and rewards
 * (`manage_gamification`). Sections a role can't use are simply absent.
 */
export default function AdminGrowthPage() {
  const { me } = useMe();
  const seesTeam = !!me?.isManager || can(me, "view_team_performance");
  const manages = can(me, "manage_gamification");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/consultant/admin" className={buttonClass("ghost", "md", "-ml-3 mb-3")}>
          <ArrowLeft size={16} aria-hidden /> Admin
        </Link>
        <PageHeader title="Acquisition & Creative" subtitle="Velocity, the team funnel and the rewards that drive it." />
      </div>
      {!me ? (
        <Skeleton className="h-[420px] rounded-2xl" />
      ) : !seesTeam && !manages ? (
        <NoAccess what="the growth view" />
      ) : (
        <>
          {seesTeam && <Velocity />}
          <section aria-labelledby="gam-h">
            <SectionTitle>
              <span id="gam-h">Gamification settings</span>
            </SectionTitle>
            <GamificationEditor canEdit={manages} />
          </section>
          <section aria-labelledby="rewards-h">
            <SectionTitle>
              <span id="rewards-h">Rewards to hand out</span>
            </SectionTitle>
            <RewardsQueue canFulfil={manages} />
          </section>
        </>
      )}
    </div>
  );
}

function Velocity() {
  const [period, setPeriod] = useState<Period>("quarter");
  const team = useMetrics(period, "team");
  const settings = useGamificationSettings();
  const target = settings.data?.closeTargetFromConnects ?? DEFAULT_CLOSE_TARGET;
  const t = team.data?.team;

  return (
    <section aria-labelledby="vel-h" className="space-y-4">
      <SectionTitle>
        <span id="vel-h">Pipeline velocity</span>
      </SectionTitle>
      <Segmented label="Period" options={PERIODS} value={period} onChange={setPeriod} labels={PERIOD_LABELS} />
      <div aria-live="polite" className="space-y-4">
        {team.loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-[92px] rounded-2xl" />
            ))}
          </div>
        ) : team.error && !team.data ? (
          <LoadError error={team.error} onRetry={() => void team.refresh()} />
        ) : t && team.data ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Velocity" value={t.velocityPerDay != null ? `${formatZar(t.velocityPerDay)}/day` : "—"} hint="open deals × win rate × avg sale ÷ cycle" />
              <Stat label="Pipeline" value={formatZar(t.pipelineValue)} hint={`weighted ${formatZar(t.weightedPipeline)}`} />
              <Stat label="Sales cycle" value={t.salesCycleDays != null ? `${Math.round(t.salesCycleDays)} days` : "—"} hint="median, lead → paid" />
              <Stat label="Avg sale" value={t.avgSale != null ? formatZar(t.avgSale) : "—"} />
              <Stat label="Revenue paid" value={formatZar(t.revenuePaid)} tone={t.revenuePaid > 0 ? "progress" : undefined} />
              <Stat label="Paid deals" value={num(t.paid)} />
              <Stat label="Paid ÷ answered" value={pct(t.rates.closeFromConnects, 1)} hint={`target ${pct(target)}`} tone={t.rates.closeFromConnects != null && t.rates.closeFromConnects >= target ? "progress" : undefined} />
              <Stat label="Show rate" value={pct(t.rates.showRate)} hint={`${num(t.noShows)} no-shows`} />
            </div>
            <TeamTable data={team.data} target={target} />
          </>
        ) : null}
      </div>
    </section>
  );
}
