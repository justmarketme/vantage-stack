"use client";

import { useCallback } from "react";
import type { z } from "zod";
import { api } from "../../lib/consultant/client/api";
import type { Meeting, MeetingInput, MeetingPatch } from "../../lib/consultant/types";
import { invalidateQueries, useQuery, type UseQueryResult } from "./useQuery";

/**
 * Discovery / demo meetings, either for a time window or for one lead.
 *
 *   const range = sastDayRange(sastToday())!;       // lib/consultant/client/format.ts
 *   const today = useMeetings(range);                // { from, to } ISO instants
 *   const forLead = useMeetings({ leadId });
 *   await today.schedule({ leadId, kind: "discovery", startsAt: sastWallClockToIso(d, t)! });
 *
 * Cached to disk for an offline agenda (meeting `notes` are blanked by the
 * cache redaction). Scheduling / status changes need a connection; on success
 * every cached `meetings:` query refreshes (a lead's stage may have moved too,
 * so `lead:` and `leads:` are refreshed as well).
 */

export type MeetingsQuery = { from: string; to: string } | { leadId: string };

export type UseMeetingsResult = UseQueryResult<Meeting[]> & {
  schedule: (input: z.input<typeof MeetingInput>) => Promise<Meeting>;
  update: (id: string, patch: MeetingPatch) => Promise<Meeting>;
};

export function meetingsKey(q: MeetingsQuery | null): string | null {
  if (!q) return null;
  return "leadId" in q ? `meetings:lead:${q.leadId}` : `meetings:range:${q.from}:${q.to}`;
}

function refreshAffected(): void {
  void invalidateQueries("meetings:");
  void invalidateQueries("lead:");
  void invalidateQueries("leads:");
}

export function useMeetings(query: MeetingsQuery | null): UseMeetingsResult {
  const key = meetingsKey(query);
  const leadId = query && "leadId" in query ? query.leadId : undefined;
  const from = query && "from" in query ? query.from : undefined;
  const to = query && "to" in query ? query.to : undefined;
  const q = useQuery<Meeting[]>(key, () => api.meetings.list({ leadId, from, to }), { persist: true, refreshMs: 60_000 });

  const schedule = useCallback(async (input: z.input<typeof MeetingInput>) => {
    const m = await api.meetings.create(input);
    refreshAffected();
    return m;
  }, []);
  const update = useCallback(async (id: string, patch: MeetingPatch) => {
    const m = await api.meetings.patch(id, patch);
    refreshAffected();
    return m;
  }, []);
  return { ...q, schedule, update };
}
