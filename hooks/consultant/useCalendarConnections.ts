"use client";

import { useCallback } from "react";
import { api } from "../../lib/consultant/client/api";
import type { CalendarConnection, CalendarProvider } from "../../lib/consultant/types";
import { useQuery, type UseQueryResult } from "./useQuery";

/**
 * Google / Outlook calendar connections for Settings.
 *
 *   const cal = useCalendarConnections();
 *   <a href={cal.connectUrl("google")}>Connect Google</a>   // full-page OAuth redirect
 *   await cal.disconnect("microsoft");
 *
 * Not persisted (holds the connected account's email address).
 * Revalidates on focus, so returning from the OAuth tab shows the new state.
 */
export type UseCalendarConnectionsResult = UseQueryResult<CalendarConnection[]> & {
  connectUrl: (provider: CalendarProvider) => string;
  disconnect: (provider: CalendarProvider) => Promise<void>;
};

export function useCalendarConnections(): UseCalendarConnectionsResult {
  const q = useQuery<CalendarConnection[]>("calendar", () => api.calendar.list());
  const { mutate, refresh } = q;
  const disconnect = useCallback(
    async (provider: CalendarProvider) => {
      await api.calendar.disconnect(provider);
      mutate((prev) =>
        (prev ?? []).map((c) =>
          c.provider === provider ? { ...c, status: "not_connected", accountEmail: null, connectedAt: null, lastError: null } : c,
        ),
      );
      void refresh();
    },
    [mutate, refresh],
  );
  return { ...q, connectUrl: api.calendar.connectUrl, disconnect };
}
