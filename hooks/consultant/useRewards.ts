"use client";

import { useCallback } from "react";
import { api, type RewardStatusFilter } from "../../lib/consultant/client/api";
import type { Reward } from "../../lib/consultant/types";
import { invalidateQueries, useQuery, type UseQueryResult } from "./useQuery";

/**
 * Tier rewards (Takealot vouchers, apparel) — pending ones to fulfil, or all.
 * `fulfil()` needs `manage_gamification`; the row updates optimistically from
 * the server response and every `rewards:` list refreshes.
 */
export type UseRewardsResult = UseQueryResult<Reward[]> & { fulfil: (id: string) => Promise<Reward> };

export function useRewards(status: RewardStatusFilter = "pending"): UseRewardsResult {
  const q = useQuery<Reward[]>(`rewards:${status}`, () => api.rewards.list(status), { refreshMs: 120_000 });
  const { mutate } = q;
  const fulfil = useCallback(
    async (id: string) => {
      const reward = await api.rewards.fulfil(id);
      mutate((prev) =>
        status === "pending" ? (prev ?? []).filter((r) => r.id !== id) : (prev ?? []).map((r) => (r.id === id ? reward : r)),
      );
      void invalidateQueries("rewards:");
      return reward;
    },
    [mutate, status],
  );
  return { ...q, fulfil };
}
