"use client";

import { useCallback } from "react";
import { api } from "../../lib/consultant/client/api";
import type { GamificationSettings } from "../../lib/consultant/types";
import { invalidateQueries, useQuery, type UseQueryResult } from "./useQuery";

/**
 * Tier thresholds, rewards and points (Acquisition & Creative admin view).
 * `save()` needs `manage_gamification`; on success the leaderboard refreshes
 * because tier progress depends on these numbers.
 */
export type UseGamificationSettingsResult = UseQueryResult<GamificationSettings> & {
  save: (settings: GamificationSettings) => Promise<GamificationSettings>;
};

export function useGamificationSettings(): UseGamificationSettingsResult {
  const q = useQuery<GamificationSettings>("settings:gamification", () => api.settings.gamification.get());
  const { mutate } = q;
  const save = useCallback(
    async (settings: GamificationSettings) => {
      const saved = await api.settings.gamification.put(settings);
      mutate(saved);
      void invalidateQueries("leaderboard:");
      return saved;
    },
    [mutate],
  );
  return { ...q, save };
}
