"use client";

import { useEffect, useState } from "react";
import { Award, PartyPopper } from "lucide-react";
import { formatZar } from "../../../lib/consultant/client/format";
import type { LeaderboardRow, TierStatus } from "../../../lib/consultant/types";
import { SURFACE } from "../ui";
import { cx } from "../utils";
import { Chip, ProgressBar } from "../wave2/parts";
import { ApparelArt, VoucherArt } from "./RewardArt";

/** "R1 500 Takealot voucher" → "R1 500" (for the voucher art). */
function amountOf(reward: string): string | undefined {
  return reward.match(/R\s?\d[\d\s]*/)?.[0].trim();
}

const SEEN_KEY = (memberId: string) => `cp:tiers-seen:${memberId}`;

/**
 * Tiers achieved since this device last looked. Stored per consultant in
 * localStorage (a convenience only — losing it just means one more cheer).
 */
function useNewlyAchieved(memberId: string | null | undefined, tiers: TierStatus[]): TierStatus[] {
  const [fresh, setFresh] = useState<TierStatus[]>([]);
  const achievedKey = tiers
    .filter((t) => t.achieved)
    .map((t) => `${t.tier}:${t.periodKey}`)
    .join("|");
  useEffect(() => {
    if (!memberId || !achievedKey) return;
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY(memberId)) ?? "[]") as string[];
    } catch {
      seen = [];
    }
    const now = achievedKey.split("|");
    const newly = tiers.filter((t) => t.achieved && !seen.includes(`${t.tier}:${t.periodKey}`));
    if (newly.length) setFresh(newly);
    try {
      localStorage.setItem(SEEN_KEY(memberId), JSON.stringify(Array.from(new Set([...seen, ...now])).slice(-40)));
    } catch {
      /* private mode — fine */
    }
    // tiers is represented by achievedKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, achievedKey]);
  return fresh;
}

/**
 * The signed-in consultant's rewards: quarterly target, Tier 1 / Tier 2
 * monthly vouchers and the Tier 3 quarterly apparel badge (Fogg: a visible,
 * near-term reward for the behaviour we want — paid deals).
 */
export function MyRewards({ row, memberId }: { row: LeaderboardRow; memberId: string | null }) {
  const byTier = Object.fromEntries(row.tiers.map((t) => [t.tier, t])) as Partial<Record<TierStatus["tier"], TierStatus>>;
  const fresh = useNewlyAchieved(memberId, row.tiers);
  const quarterCurrent = Math.round(row.quarterProgress * row.quarterTarget);

  return (
    <section aria-labelledby="my-rewards-h" className="space-y-3">
      <h2 id="my-rewards-h" className="font-heading text-sm font-medium uppercase tracking-[0.14em] text-[--cp-muted]">
        Your rewards
      </h2>

      <div aria-live="polite">
        {fresh.length > 0 && (
          <div className={cx(SURFACE, "cp-celebrate flex items-center gap-3 p-4")}>
            <PartyPopper size={22} aria-hidden className="shrink-0 text-[--cp-progress]" />
            <p className="text-sm text-[--cp-text]">
              <span className="font-medium">
                {fresh.length === 1 ? `${fresh[0].label} unlocked` : `${fresh.length} tiers unlocked`}
              </span>{" "}
              — {fresh.map((t) => t.reward).join(" and ")} is yours. Keep the pipeline moving.
            </p>
          </div>
        )}
      </div>

      <div className={cx(SURFACE, "p-4")}>
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-[--cp-muted]">Quarterly target</p>
          <p className="text-sm tabular-nums text-[--cp-text]">
            {formatZar(quarterCurrent)} <span className="text-[--cp-muted]">/ {formatZar(row.quarterTarget)}</span>
          </p>
        </div>
        <ProgressBar className="mt-2" height="h-3" value={row.quarterProgress} label="Quarterly target progress" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {(["tier1_monthly_achiever", "tier2_high_performer"] as const).map((id) => {
          const t = byTier[id];
          if (!t) return null;
          return (
            <div key={id} className={cx(SURFACE, "flex flex-col gap-3 p-4")}>
              <VoucherArt earned={t.achieved} amount={amountOf(t.reward)} className="max-w-[200px]" />
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium text-[--cp-text]">{t.label}</p>
                  {t.achieved ? <Chip tone="progress">Achieved</Chip> : <Chip>{id === "tier1_monthly_achiever" ? "Tier 1" : "Tier 2"}</Chip>}
                </div>
                <p className="text-xs text-[--cp-muted]">{t.reward} · {t.periodKey}</p>
              </div>
              <div className="mt-auto">
                <ProgressBar value={t.progress} label={`${t.label} progress`} />
                <p className="mt-1 text-xs tabular-nums text-[--cp-muted]">
                  {formatZar(t.current)} of {formatZar(t.threshold)} paid this month
                </p>
              </div>
            </div>
          );
        })}
        {byTier.tier3_quarter_top && (
          <div className={cx(SURFACE, "flex flex-col gap-3 p-4")}>
            <ApparelArt earned={byTier.tier3_quarter_top.achieved} className="max-w-[200px]" />
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-[--cp-text]">{byTier.tier3_quarter_top.label}</p>
                {byTier.tier3_quarter_top.achieved ? (
                  <Chip tone="progress">
                    <Award size={12} aria-hidden /> Badge earned
                  </Chip>
                ) : (
                  <Chip>Tier 3</Chip>
                )}
              </div>
              <p className="text-xs text-[--cp-muted]">
                {byTier.tier3_quarter_top.reward} · {byTier.tier3_quarter_top.periodKey}
              </p>
            </div>
            <div className="mt-auto">
              <ProgressBar value={byTier.tier3_quarter_top.progress} label="Quarter top performer progress" />
              <p className="mt-1 text-xs tabular-nums text-[--cp-muted]">
                {formatZar(byTier.tier3_quarter_top.current)} of {formatZar(byTier.tier3_quarter_top.threshold)} this quarter · top ranks qualify
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
