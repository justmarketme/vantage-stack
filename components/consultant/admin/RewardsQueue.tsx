"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { useRewards } from "../../../hooks/consultant/useRewards";
import { formatSastDate } from "../../../lib/consultant/client/format";
import type { Reward } from "../../../lib/consultant/types";
import { Button, EmptyState, SkeletonList, SURFACE } from "../ui";
import { cx, describeError } from "../utils";
import { Chip, LoadError } from "../wave2/parts";

const TIER_SHORT: Record<Reward["tier"], string> = {
  tier1_monthly_achiever: "Tier 1",
  tier2_high_performer: "Tier 2",
  tier3_quarter_top: "Tier 3",
};

/** Rewards earned but not yet handed over. Fulfilling needs `manage_gamification`. */
export function RewardsQueue({ canFulfil }: { canFulfil: boolean }) {
  const rewards = useRewards("pending");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fulfil = async (r: Reward) => {
    setBusy(r.id);
    setError(null);
    try {
      await rewards.fulfil(r.id);
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div aria-live="polite">
      {error && (
        <p role="alert" className="mb-2 text-sm text-[--cp-risk]">
          {error}
        </p>
      )}
      {rewards.loading ? (
        <SkeletonList rows={3} rowClass="h-[72px]" />
      ) : rewards.error && !rewards.data ? (
        <LoadError error={rewards.error} onRetry={() => void rewards.refresh()} />
      ) : (rewards.data ?? []).length === 0 ? (
        <EmptyState title="Nothing to hand out" body="New tier rewards appear here the moment someone earns one." />
      ) : (
        <ul className="space-y-2">
          {(rewards.data ?? []).map((r) => (
            <li key={r.id} className={cx(SURFACE, "flex flex-wrap items-center gap-3 p-3")}>
              <Gift size={18} aria-hidden className="shrink-0 text-[--cp-progress]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[--cp-text]">
                  {r.consultantName} · {r.reward}
                </p>
                <p className="text-xs text-[--cp-muted]">
                  {r.periodKey} · earned {formatSastDate(r.achievedAt)}
                </p>
              </div>
              <Chip>{TIER_SHORT[r.tier]}</Chip>
              {canFulfil && (
                <Button variant="progress" disabled={busy === r.id} onClick={() => void fulfil(r)}>
                  {busy === r.id ? "Saving…" : "Mark handed over"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
