"use client";

import { useCallback } from "react";
import { api, type LeaderboardRankBy } from "../../lib/consultant/client/api";
import type { RealtimeStatus } from "../../lib/consultant/client/realtime";
import type { Leaderboard, Period } from "../../lib/consultant/types";
import { useNudgedRefresh } from "./useNudgedRefresh";
import { queryStore, useQuery, type UseQueryResult } from "./useQuery";

/**
 * The live leaderboard.
 *
 *   const { data, loading, realtime } = useLeaderboard("month", "points");
 *
 * - Refetches through `GET leaderboard` whenever a `<prefix>:leaderboard`
 *   nudge arrives (bursts coalesced: 300ms after the last nudge, at most 2s
 *   apart while they keep coming).
 * - Polls every 2 min as a backstop while realtime is live, every 30s when it
 *   isn't (missing env, blocked socket, channel error).
 * - Cached to disk (numbers + consultant names only; commission is visible to
 *   all consultants by decision) so it opens instantly, even offline.
 * - An unchanged response keeps the previous `data` object, so memoised rows
 *   don't re-render and nothing shifts.
 */

export const LEADERBOARD_LIVE_BACKSTOP_MS = 120_000;
export const LEADERBOARD_POLL_MS = 30_000;

export type UseLeaderboardResult = UseQueryResult<Leaderboard> & { realtime: RealtimeStatus };

export function leaderboardKey(period: Period, rankBy: LeaderboardRankBy): string {
  return `leaderboard:${period}:${rankBy}`;
}

/**
 * Structural sharing: return `prev` when `next` carries the same content
 * (ignoring the listed volatile fields such as `generatedAt`).
 */
export function keepIfUnchanged<T extends object>(prev: T | undefined, next: T, ignore: (keyof T)[] = []): T {
  if (!prev) return next;
  const strip = (v: T) => {
    const copy = { ...v } as Record<string, unknown>;
    for (const k of ignore) delete copy[k as string];
    return copy;
  };
  try {
    return JSON.stringify(strip(prev)) === JSON.stringify(strip(next)) ? prev : next;
  } catch {
    return next;
  }
}

export function useLeaderboard(period: Period, rankBy: LeaderboardRankBy = "points"): UseLeaderboardResult {
  const key = leaderboardKey(period, rankBy);
  const fetcher = useCallback(async () => {
    const next = await api.leaderboard.get(period, rankBy);
    return keepIfUnchanged(queryStore.get(key).data as Leaderboard | undefined, next, ["generatedAt"]);
  }, [key, period, rankBy]);

  const realtime = useNudgedRefresh("leaderboard", "leaderboard:");
  const q = useQuery<Leaderboard>(key, fetcher, {
    persist: true,
    refreshMs: realtime === "live" ? LEADERBOARD_LIVE_BACKSTOP_MS : LEADERBOARD_POLL_MS,
  });
  return { ...q, realtime };
}
