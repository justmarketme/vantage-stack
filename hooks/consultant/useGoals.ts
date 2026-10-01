"use client";

import { useCallback } from "react";
import type { z } from "zod";
import { api } from "../../lib/consultant/client/api";
import type { Goal, GoalInput, GoalPatch } from "../../lib/consultant/types";
import { invalidateQueries, useQuery, type UseQueryResult } from "./useQuery";

/**
 * Why Board goals — mine, or a consultant's when a manager passes `consultantId`.
 *
 *   const { data: goals, create, update, remove } = useGoals();
 *
 * Not persisted to disk: goals carry the rep's personal "why" and short-lived
 * signed image URLs, neither of which belongs in localStorage.
 * Mutations go straight to the API (they need a connection) and refresh every
 * cached `goals:` list on success.
 */

export type UseGoalsResult = UseQueryResult<Goal[]> & {
  create: (input: z.input<typeof GoalInput>) => Promise<Goal>;
  update: (id: string, patch: GoalPatch) => Promise<Goal>;
  remove: (id: string) => Promise<void>;
};

export function goalsKey(consultantId?: string | null): string {
  return `goals:${consultantId || "me"}`;
}

export function useGoals(consultantId?: string | null): UseGoalsResult {
  const key = goalsKey(consultantId);
  const q = useQuery<Goal[]>(key, () => api.goals.list({ consultantId: consultantId ?? undefined }), { refreshMs: 120_000 });
  const { mutate } = q;

  const create = useCallback(
    async (input: z.input<typeof GoalInput>) => {
      const goal = await api.goals.create(input);
      mutate((prev) => [...(prev ?? []), goal]);
      void invalidateQueries("goals:");
      return goal;
    },
    [mutate],
  );
  const update = useCallback(
    async (id: string, patch: GoalPatch) => {
      const goal = await api.goals.patch(id, patch);
      mutate((prev) => (prev ?? []).map((g) => (g.id === id ? goal : g)));
      void invalidateQueries("goals:");
      return goal;
    },
    [mutate],
  );
  const remove = useCallback(
    async (id: string) => {
      await api.goals.remove(id);
      mutate((prev) => (prev ?? []).filter((g) => g.id !== id));
      void invalidateQueries("goals:");
    },
    [mutate],
  );
  return { ...q, create, update, remove };
}
