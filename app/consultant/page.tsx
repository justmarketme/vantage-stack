"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "../../lib/consultant/client/api";
import { useQuery } from "../../hooks/consultant/useQuery";
import type { Lead, TodayStats } from "../../lib/consultant/types";
import { CallButton } from "../../components/consultant/CallButton";
import { ClaimButton } from "../../components/consultant/ClaimButton";
import { LeadRow } from "../../components/consultant/LeadRow";
import { useMe } from "../../components/consultant/MeProvider";
import { StatsStrip } from "../../components/consultant/StatsStrip";
import { ConsultantFilter, consultantsFrom } from "../../components/consultant/ConsultantFilter";
import { EmptyState, ErrorState, PageHeader, SectionTitle, SkeletonList, buttonClass } from "../../components/consultant/ui";
import { describeError } from "../../components/consultant/utils";

const CALL_NEXT_MAX = 8;

function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/** Due follow-ups first (oldest due first), then new leads (oldest first). */
function callNext(leads: Lead[]): Lead[] {
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const open = leads.filter((l) => l.salesStage !== "won" && l.salesStage !== "lost");
  const due = open
    .filter((l) => l.nextActionAt && new Date(l.nextActionAt).getTime() <= endOfDay.getTime())
    .sort((a, b) => new Date(a.nextActionAt!).getTime() - new Date(b.nextActionAt!).getTime());
  const dueIds = new Set(due.map((l) => l.id));
  const fresh = open
    .filter((l) => !dueIds.has(l.id) && l.salesStage === "new")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return [...due, ...fresh].slice(0, CALL_NEXT_MAX);
}

export default function TodayPage() {
  const { me } = useMe();
  const isManager = !!me?.isManager;
  const [consultantId, setConsultantId] = useState<string>("");

  const stats = useQuery<TodayStats>(
    me ? `stats:today:${consultantId || "me"}` : null,
    () => api.stats.today(consultantId ? { consultantId } : undefined),
    { refreshMs: 60_000 },
  );
  // Managers see everyone's queue (filterable); consultants see their own.
  const scope = isManager ? "all" : "mine";
  const mine = useQuery<Lead[]>(me ? `leads:${scope}:` : null, () => api.leads.list({ scope }), { persist: true, refreshMs: 60_000 });
  const pool = useQuery<Lead[]>(me ? "leads:pool:" : null, () => api.leads.list({ scope: "pool" }), { persist: true, refreshMs: 120_000 });

  const consultants = useMemo(() => (isManager ? consultantsFrom(mine.data ?? []) : []), [isManager, mine.data]);
  const queue = useMemo(() => {
    const list = (mine.data ?? []).filter((l) => !consultantId || l.consultantId === consultantId);
    return callNext(list);
  }, [mine.data, consultantId]);

  const firstName = me?.displayName?.split(/\s+/)[0];
  const today = new Intl.DateTimeFormat("en-ZA", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? `${greeting()}, ${firstName}` : "Today"}
        subtitle={today}
        action={
          isManager ? (
            <ConsultantFilter consultants={consultants} value={consultantId} onChange={setConsultantId} />
          ) : undefined
        }
      />

      <section aria-labelledby="stats-h">
        <h2 id="stats-h" className={isManager ? "mb-2 text-xs text-[--cp-muted]" : "sr-only"}>
          {isManager ? (consultantId ? `${consultants.find((c) => c.id === consultantId)?.name ?? "Consultant"}'s numbers today` : "Your numbers today") : "Today's numbers"}
        </h2>
        {stats.error && !stats.data ? (
          <ErrorState message={describeError(stats.error, "load")} onRetry={() => void stats.refresh()} />
        ) : (
          <StatsStrip stats={stats.data} />
        )}
      </section>

      <section aria-labelledby="next-h">
        <SectionTitle
          aside={
            stats.data && stats.data.dueFollowUps > 0 ? (
              <span className="text-xs text-[--cp-objection]">{stats.data.dueFollowUps} follow-ups due</span>
            ) : undefined
          }
        >
          <span id="next-h">Call next</span>
        </SectionTitle>
        {mine.loading || !me ? (
          <SkeletonList rows={4} />
        ) : mine.error && !mine.data ? (
          <ErrorState message={describeError(mine.error, "load")} onRetry={() => void mine.refresh()} />
        ) : queue.length === 0 ? (
          <EmptyState
            title="Nothing due right now"
            body="No follow-ups due today and no new leads waiting. Claim one from the pool or add a clinic."
            action={{ href: "/consultant/leads/new", label: "Add a clinic" }}
          />
        ) : (
          <ul className="space-y-2">
            {queue.map((l) => (
              <LeadRow key={l.id} lead={l} showOwner={isManager && !consultantId} action={<CallButton lead={l} />} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pool-h">
        <SectionTitle
          aside={
            <Link href="/consultant/pipeline?scope=pool" className={buttonClass("ghost", "md", "min-h-11 px-3 text-xs")}>
              See all
            </Link>
          }
        >
          <span id="pool-h">
            Unassigned pool{pool.data ? ` · ${pool.data.length}` : ""}
          </span>
        </SectionTitle>
        {pool.loading || !me ? (
          <SkeletonList rows={2} />
        ) : pool.error && !pool.data ? (
          <ErrorState message={describeError(pool.error, "load")} onRetry={() => void pool.refresh()} />
        ) : (pool.data ?? []).length === 0 ? (
          <p className="text-sm text-[--cp-muted]">The pool is empty — every clinic has an owner.</p>
        ) : (
          <ul className="space-y-2">
            {(pool.data ?? []).slice(0, 3).map((l) => (
              <LeadRow
                key={l.id}
                lead={l}
                showStage={false}
                action={me?.canCall ? <ClaimButton lead={l} /> : undefined}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
