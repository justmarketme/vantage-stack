"use client";

import { useCallback } from "react";
import { api, type TeamFunnelMetrics } from "../../lib/consultant/client/api";
import type { RealtimeStatus } from "../../lib/consultant/client/realtime";
import type { FunnelMetrics, Period } from "../../lib/consultant/types";
import { keepIfUnchanged } from "./useLeaderboard";
import { useNudgedRefresh } from "./useNudgedRefresh";
import { queryStore, useQuery, type UseQueryResult } from "./useQuery";

/**
 * Funnel metrics for the Performance page.
 *
 *   useMetrics("month")                 → my FunnelMetrics
 *   useMetrics("month", consultantId)   → another consultant's (managers)
 *   useMetrics("quarter", "team")       → { team, byConsultant } (managers)
 *
 * Live: any metric-affecting change nudges `<prefix>:leaderboard`, which
 * refetches every mounted `metrics:` query (coalesced). Polls every 2 min
 * as a backstop while live, every 60s otherwise. Cached to disk (numbers only).
 */

export function metricsKey(period: Period, consultantId?: string | null): string {
  return `metrics:${period}:${consultantId || "me"}`;
}

export function useMetrics(period: Period, consultantId: "team"): UseQueryResult<TeamFunnelMetrics> & { realtime: RealtimeStatus };
export function useMetrics(period: Period, consultantId?: string | null): UseQueryResult<FunnelMetrics> & { realtime: RealtimeStatus };
export function useMetrics(
  period: Period,
  consultantId?: string | null,
): (UseQueryResult<FunnelMetrics> | UseQueryResult<TeamFunnelMetrics>) & { realtime: RealtimeStatus } {
  const key = metricsKey(period, consultantId);
  const fetcher = useCallback(async (): Promise<FunnelMetrics | TeamFunnelMetrics> => {
    const next = consultantId === "team" ? await api.metrics.team(period) : await api.metrics.get(period, consultantId ?? undefined);
    return keepIfUnchanged(queryStore.get(key).data as typeof next | undefined, next);
  }, [key, period, consultantId]);
  const realtime = useNudgedRefresh("leaderboard", "metrics:");
  const q = useQuery<FunnelMetrics | TeamFunnelMetrics>(key, fetcher, {
    persist: true,
    refreshMs: realtime === "live" ? 120_000 : 60_000,
  });
  // One cache entry per key; the key encodes which shape the server returns.
  return { ...(q as UseQueryResult<FunnelMetrics>), realtime };
}
