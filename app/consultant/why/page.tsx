"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { api } from "../../../lib/consultant/client/api";
import { useQuery } from "../../../hooks/consultant/useQuery";
import type { Goal, Leaderboard } from "../../../lib/consultant/types";
import { useMe } from "../../../components/consultant/MeProvider";
import { Button, EmptyState, PageHeader, Skeleton } from "../../../components/consultant/ui";
import { cx, FOCUS } from "../../../components/consultant/utils";
import { GoalCard } from "../../../components/consultant/why/GoalCard";
import { GoalSheet } from "../../../components/consultant/why/GoalSheet";
import { useGoals } from "../../../hooks/consultant/useGoals";
import { invalidateQueries } from "../../../components/consultant/wave2/data";
import { can, LoadError } from "../../../components/consultant/wave2/parts";
import { INPUT_CLASS } from "../../../components/consultant/MicField";

/**
 * Why Board — the consultant's personal reasons to pick up the phone
 * (Fogg: Motivation). Visible to the consultant and to managers (Decision 4);
 * managers can switch to any consultant's board, read-only.
 */
export default function WhyBoardPage() {
  const { me } = useMe();
  const isManager = !!me?.isManager || can(me, "view_team_performance");
  const [viewing, setViewing] = useState<string>(""); // "" = my own board
  const ownBoard = !viewing || viewing === me?.memberId;

  const goals = useGoals(viewing || null);
  // The leaderboard is visible to everyone and lists every consultant — a cheap roster for the picker.
  const roster = useQuery<Leaderboard>(isManager ? "leaderboard:quarter:revenue" : null, () => api.leaderboard.get("quarter", "revenue"));
  const people = useMemo(
    () => (roster.data?.rows ?? []).map((r) => ({ id: r.consultantId, name: r.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [roster.data],
  );

  const [editing, setEditing] = useState<Goal | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const canEdit = ownBoard && !!me?.memberId;

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (g: Goal) => {
    setEditing(g);
    setSheetOpen(true);
  };

  const sorted = useMemo(
    () =>
      [...(goals.data ?? [])].sort((a, b) => {
        const done = Number(a.progress >= 1) - Number(b.progress >= 1);
        return done !== 0 ? done : a.targetDate.localeCompare(b.targetDate);
      }),
    [goals.data],
  );
  const viewingName = people.find((p) => p.id === viewing)?.name;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Why Board"
        subtitle={ownBoard ? "What you're working for — and what it takes each day." : `${viewingName ?? "Consultant"}'s board`}
        action={
          canEdit && sorted.length > 0 ? (
            <Button variant="primary" onClick={openNew}>
              <Plus size={16} aria-hidden /> New goal
            </Button>
          ) : undefined
        }
      />

      {isManager && (
        <div className="max-w-xs">
          <label htmlFor="why-who" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">
            Board
          </label>
          <select id="why-who" value={viewing} onChange={(e) => setViewing(e.target.value)} className={cx(INPUT_CLASS, "border-[--cp-border]", FOCUS)}>
            <option value="">{me?.memberId ? "My board" : "Choose a consultant"}</option>
            {people
              .filter((p) => p.id !== me?.memberId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      )}

      <div aria-live="polite" aria-busy={goals.loading}>
        {me && !me.memberId && !viewing ? (
          <EmptyState title="Choose a consultant" body="Pick someone above to see their Why Board." />
        ) : goals.loading || !me ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading goals">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[380px] rounded-2xl" />
            ))}
          </div>
        ) : goals.error && !goals.data ? (
          <LoadError error={goals.error} onRetry={() => void goals.refresh()} />
        ) : sorted.length === 0 ? (
          canEdit ? (
            <div className="rounded-2xl border border-dashed border-[--cp-border-strong] px-5 py-10 text-center">
              <p className="font-heading text-lg text-[--cp-text]">Start with your why</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-[--cp-muted]">
                A house deposit, a trip, school fees — put it here with a picture. We&apos;ll work out the dials it takes each day.
              </p>
              <Button variant="primary" size="lg" className="mt-4" onClick={openNew}>
                <Plus size={18} aria-hidden /> Add your first goal
              </Button>
            </div>
          ) : (
            <EmptyState title="No goals yet" body={ownBoard ? "Sign in with your consultant account to add goals." : "This consultant hasn't added any goals."} />
          )
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((g) => (
              <GoalCard key={g.id} goal={g} onEdit={canEdit ? openEdit : undefined} />
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <GoalSheet
          open={sheetOpen}
          goal={editing}
          onClose={() => setSheetOpen(false)}
          onSaved={(g) => {
            goals.mutate((prev) => {
              const list = prev ?? [];
              return list.some((x) => x.id === g.id) ? list.map((x) => (x.id === g.id ? g : x)) : [...list, g];
            });
            void invalidateQueries("goals:");
            setSheetOpen(false);
          }}
          onDeleted={(id) => {
            goals.mutate((prev) => (prev ?? []).filter((x) => x.id !== id));
            void invalidateQueries("goals:");
            setSheetOpen(false);
          }}
        />
      )}
    </div>
  );
}
