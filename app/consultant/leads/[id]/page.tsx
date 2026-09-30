"use client";

import Link from "next/link";
import { use, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../../../../lib/consultant/client/api";
import { useOutbox } from "../../../../hooks/consultant/useOutbox";
import { invalidateQueries, useQuery } from "../../../../hooks/consultant/useQuery";
import type { LeadDetail, LeadPatch } from "../../../../lib/consultant/types";
import { CallTimeline } from "../../../../components/consultant/CallTimeline";
import { LeadHeader, NextActionCard } from "../../../../components/consultant/LeadPanels";
import { useMe } from "../../../../components/consultant/MeProvider";
import { NoteList } from "../../../../components/consultant/notes/NoteList";
import { useOutboxSynced } from "../../../../components/consultant/hooks";
import { ErrorState, SectionTitle, Skeleton, buttonClass } from "../../../../components/consultant/ui";
import { describeError, errorStatus } from "../../../../components/consultant/utils";

export default function LeadWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useMe();
  const key = `lead:${id}`;
  const detail = useQuery<LeadDetail>(key, () => api.leads.get(id), { persist: true, refreshMs: 30_000 });
  const { enqueue } = useOutbox();

  // A queued edit landed → confirm against the server.
  useOutboxSynced(() => void detail.refresh());

  const patch = useCallback(
    (p: LeadPatch) => {
      detail.mutate((prev) => (prev ? { ...prev, lead: { ...prev.lead, ...p } as LeadDetail["lead"] } : (prev as unknown as LeadDetail)));
      enqueue({ kind: "lead.patch", leadId: id, patch: p });
      void invalidateQueries("leads:");
    },
    [detail, enqueue, id],
  );

  const back = (
    <Link href="/consultant/pipeline" className={buttonClass("ghost", "md", "-ml-3 mb-3")}>
      <ArrowLeft size={16} aria-hidden /> Pipeline
    </Link>
  );

  if (detail.loading) {
    return (
      <div>
        {back}
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-[320px] rounded-2xl" />
            <Skeleton className="h-[96px] rounded-2xl" />
          </div>
          <div className="space-y-3 lg:col-span-3">
            <Skeleton className="h-[120px] rounded-2xl" />
            <Skeleton className="h-[160px] rounded-2xl" />
          </div>
        </div>
      </div>
    );
  }
  if (!detail.data) {
    const status = errorStatus(detail.error);
    return (
      <div>
        {back}
        <ErrorState
          message={status === 404 || status === 403 ? "This clinic isn't in your pipeline (or the pool)." : describeError(detail.error, "load")}
          onRetry={status === 404 || status === 403 ? undefined : () => void detail.refresh()}
        />
      </div>
    );
  }

  const { lead, calls, notes } = detail.data;
  const canCall = !!me?.canCall;
  const unassigned = !lead.consultantId;
  const readOnly = !canCall || (unassigned && !me?.isManager);

  return (
    <div>
      {back}
      {detail.stale && <p className="mb-3 text-xs text-[--cp-muted]">Showing saved copy — refreshing…</p>}
      <div className="grid gap-4 lg:grid-cols-5 lg:gap-6">
        <div className="space-y-4 lg:col-span-2">
          <LeadHeader lead={lead} readOnly={readOnly} canClaim={canCall && unassigned} onPatch={patch} />
          <NextActionCard lead={lead} readOnly={readOnly} onPatch={patch} />
        </div>
        <div className="space-y-6 lg:col-span-3">
          <section aria-labelledby="calls-h">
            <SectionTitle>
              <span id="calls-h">Calls</span>
            </SectionTitle>
            <CallTimeline calls={calls} />
          </section>
          <section aria-labelledby="notes-h">
            <SectionTitle>
              <span id="notes-h">Notes</span>
            </SectionTitle>
            <NoteList leadId={lead.id} notes={notes} readOnly={readOnly} />
          </section>
        </div>
      </div>
    </div>
  );
}
