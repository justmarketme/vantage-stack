"use client";

import { useCallback } from "react";
import { api, type DeadLetter, type DeadLetterKind } from "../../lib/consultant/client/api";
import type { SystemHealth } from "../../lib/consultant/types";
import { useQuery, type UseQueryResult } from "./useQuery";

/**
 * Systems & Operations view: platform health (every 30s while visible) plus
 * the dead-letter list with retry. Needs `view_system_health`. Never persisted.
 */
export type UseSystemHealthResult = UseQueryResult<SystemHealth> & {
  deadLetters: UseQueryResult<DeadLetter[]>;
  retry: (kind: DeadLetterKind, id: string) => Promise<void>;
};

export function useSystemHealth(): UseSystemHealthResult {
  const health = useQuery<SystemHealth>("admin:health", () => api.admin.health(), { refreshMs: 30_000 });
  const deadLetters = useQuery<DeadLetter[]>("admin:dead-letters", () => api.admin.deadLetters(), { refreshMs: 60_000 });
  const { mutate: mutateDead } = deadLetters;
  const { refresh: refreshHealth } = health;
  const retry = useCallback(
    async (kind: DeadLetterKind, id: string) => {
      await api.admin.retryDeadLetter(kind, id);
      mutateDead((prev) => (prev ?? []).filter((d) => !(d.kind === kind && d.id === id)), { revalidate: true });
      void refreshHealth();
    },
    [mutateDead, refreshHealth],
  );
  return { ...health, deadLetters, retry };
}
