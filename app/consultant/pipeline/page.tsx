"use client";

import { Suspense, useCallback, useEffect, useId, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { api } from "../../../lib/consultant/client/api";
import { useQuery } from "../../../hooks/consultant/useQuery";
import { SALES_STAGES, SALES_STAGE_LABELS, type Lead, type SalesStage } from "../../../lib/consultant/types";
import { CallButton } from "../../../components/consultant/CallButton";
import { ClaimButton } from "../../../components/consultant/ClaimButton";
import { ConsultantFilter, consultantsFrom } from "../../../components/consultant/ConsultantFilter";
import { KanbanColumn } from "../../../components/consultant/KanbanColumn";
import { LeadRow } from "../../../components/consultant/LeadRow";
import { useMe } from "../../../components/consultant/MeProvider";
import { useDebounced, useIsDesktop } from "../../../components/consultant/hooks";
import { EmptyState, ErrorState, PageHeader, Skeleton, SkeletonList } from "../../../components/consultant/ui";
import { cx, describeError, FOCUS } from "../../../components/consultant/utils";

type Scope = "mine" | "pool" | "all";

export default function PipelinePage() {
  return (
    <Suspense fallback={<SkeletonList rows={5} />}>
      <Pipeline />
    </Suspense>
  );
}

function Pipeline() {
  const { me } = useMe();
  const isManager = !!me?.isManager;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const isDesktop = useIsDesktop();
  const searchId = useId();

  const scopes: Scope[] = isManager ? ["mine", "pool", "all"] : ["mine", "pool"];
  const rawScope = params.get("scope") as Scope | null;
  const scope: Scope = rawScope && scopes.includes(rawScope) ? rawScope : "mine";
  const setScope = useCallback(
    (s: Scope) => router.replace(s === "mine" ? pathname : `${pathname}?scope=${s}`, { scroll: false }),
    [router, pathname],
  );

  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const [consultantId, setConsultantId] = useState("");
  const [stageTab, setStageTab] = useState<SalesStage | "all">("all");

  const leads = useQuery<Lead[]>(
    me ? `leads:${scope}:${dq}` : null,
    () => api.leads.list({ scope, q: dq || undefined }),
    { persist: !dq, refreshMs: 60_000 },
  );

  const consultants = useMemo(() => (isManager && scope === "all" ? consultantsFrom(leads.data ?? []) : []), [isManager, scope, leads.data]);
  useEffect(() => setConsultantId(""), [scope]);

  const filtered = useMemo(
    () => (leads.data ?? []).filter((l) => !consultantId || l.consultantId === consultantId),
    [leads.data, consultantId],
  );
  const byStage = useMemo(() => {
    const m = new Map<SalesStage, Lead[]>(SALES_STAGES.map((s) => [s, []]));
    for (const l of filtered) m.get(l.salesStage)?.push(l);
    return m;
  }, [filtered]);

  const action = useCallback(
    (l: Lead) => (scope === "pool" || !l.consultantId ? (me?.canCall ? <ClaimButton lead={l} /> : null) : <CallButton lead={l} />),
    [scope, me?.canCall],
  );

  const scopeLabel: Record<Scope, string> = { mine: "Mine", pool: "Pool", all: "All" };
  const listForTab = stageTab === "all" ? filtered : byStage.get(stageTab) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        subtitle={leads.data ? `${filtered.length} ${filtered.length === 1 ? "clinic" : "clinics"}` : " "}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Whose leads" className="flex rounded-xl bg-[--cp-surface] p-1">
          {scopes.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={scope === s}
              onClick={() => setScope(s)}
              className={cx(
                "min-h-10 rounded-lg px-4 text-sm font-medium",
                FOCUS,
                scope === s ? "bg-[--cp-surface-3] text-[--cp-text]" : "text-[--cp-muted] hover:text-[--cp-text]",
              )}
            >
              {scopeLabel[s]}
            </button>
          ))}
        </div>
        {isManager && scope === "all" && (
          <ConsultantFilter consultants={consultants} value={consultantId} onChange={setConsultantId} />
        )}
        <div className="relative min-w-[12rem] flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search clinics
          </label>
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[--cp-muted]" />
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clinic, contact, city"
            className={cx(
              "min-h-11 w-full rounded-xl border border-[--cp-border] bg-[--cp-surface] pl-9 pr-3 text-sm text-[--cp-text] placeholder:text-[--cp-muted]",
              FOCUS,
            )}
          />
        </div>
      </div>

      {leads.error && !leads.data ? (
        <ErrorState message={describeError(leads.error, "load")} onRetry={() => void leads.refresh()} />
      ) : isDesktop ? (
        leads.loading || !me ? (
          <div className="flex gap-3 overflow-hidden">
            {SALES_STAGES.map((s) => (
              <div key={s} className="w-[264px] shrink-0 space-y-2">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-[108px] rounded-2xl" />
                <Skeleton className="h-[108px] rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="-mx-2 flex gap-3 overflow-x-auto px-2 pb-4">
            {SALES_STAGES.map((s) => (
              <KanbanColumn
                key={s}
                stage={s}
                leads={byStage.get(s) ?? []}
                renderAction={action}
                showOwner={isManager && scope === "all" && !consultantId}
              />
            ))}
          </div>
        )
      ) : (
        <>
          <div role="tablist" aria-label="Stage" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {(["all", ...SALES_STAGES] as const).map((s) => {
              const count = s === "all" ? filtered.length : byStage.get(s)?.length ?? 0;
              const selected = stageTab === s;
              return (
                <button
                  key={s}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setStageTab(s)}
                  className={cx(
                    "flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium",
                    FOCUS,
                    selected ? "bg-[--cp-accent-soft] text-[--cp-accent-text]" : "bg-[--cp-surface] text-[--cp-muted]",
                  )}
                >
                  {s === "all" ? "All" : SALES_STAGE_LABELS[s]}
                  <span className="text-xs opacity-80">{leads.data ? count : "–"}</span>
                </button>
              );
            })}
          </div>
          <div role="tabpanel">
            {leads.loading || !me ? (
              <SkeletonList rows={5} />
            ) : listForTab.length === 0 ? (
              scope === "pool" ? (
                <EmptyState title="The pool is empty" body="Every clinic has an owner right now." />
              ) : (
                <EmptyState
                  title={dq ? "No clinics match" : "No clinics here yet"}
                  body={dq ? "Try a different name or city." : "Add a clinic or claim one from the pool."}
                  action={dq ? undefined : { href: "/consultant/leads/new", label: "Add a clinic" }}
                />
              )
            ) : (
              <ul className="space-y-2">
                {listForTab.map((l) => (
                  <LeadRow
                    key={l.id}
                    lead={l}
                    showStage={stageTab === "all"}
                    showOwner={isManager && scope === "all" && !consultantId}
                    action={action(l)}
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}

    </div>
  );
}
