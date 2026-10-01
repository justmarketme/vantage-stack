"use client";

import { useCallback } from "react";
import { api } from "../../lib/consultant/client/api";
import type { TrainingModule } from "../../lib/consultant/types";
import { useQuery, type UseQueryResult } from "./useQuery";

/**
 * The 6-module Sales Readiness series. Sequential unlock is enforced by the
 * server; `complete()` stores the refreshed list it returns.
 * Cached to disk so the hub opens offline (titles + progress only).
 */
export type UseTrainingResult = UseQueryResult<TrainingModule[]> & {
  complete: (moduleId: string) => Promise<TrainingModule[]>;
  /** 0..1 share of modules completed. */
  progress: number;
};

export function useTraining(): UseTrainingResult {
  const q = useQuery<TrainingModule[]>("training", () => api.training.list(), { persist: true });
  const { mutate } = q;
  const complete = useCallback(
    async (moduleId: string) => {
      const list = await api.training.complete(moduleId);
      mutate(list);
      return list;
    },
    [mutate],
  );
  const list = q.data ?? [];
  const progress = list.length ? list.filter((m) => m.completedAt).length / list.length : 0;
  return { ...q, complete, progress };
}
