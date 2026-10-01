"use client";

import { useEffect, useMemo, useRef } from "react";
import { coalesce, type NudgeTopic, type RealtimeStatus } from "../../lib/consultant/client/realtime";
import { useRealtimeNudge } from "./useRealtimeNudge";
import { queryStore } from "./useQuery";

/** Wait after the last nudge in a burst before refetching. */
export const NUDGE_COALESCE_MS = 300;
/** …but never hold a refetch back longer than this while nudges keep coming. */
export const NUDGE_MAX_WAIT_MS = 2_000;

/**
 * Glue between a realtime topic and cached queries: a nudge on `topic`
 * revalidates every cached key starting with `keyPrefix` (bursts coalesced).
 *
 * A nudge that lands while a fetch for that key is already on the wire would
 * otherwise be "de-duplicated" into the older request and its change missed —
 * so in that case one extra fetch runs after the current one.
 */
export function useNudgedRefresh(topic: NudgeTopic | null, keyPrefix: string | null): RealtimeStatus {
  const prefixRef = useRef(keyPrefix);
  prefixRef.current = keyPrefix;

  const refresh = useMemo(
    () =>
      coalesce(
        () => {
          const prefix = prefixRef.current;
          if (!prefix) return;
          for (const key of queryStore.mountedKeys()) {
            if (!key.startsWith(prefix)) continue;
            const wasFetching = queryStore.isFetching(key);
            void queryStore.revalidate(key).then(() => {
              if (wasFetching) void queryStore.revalidate(key);
            });
          }
        },
        NUDGE_COALESCE_MS,
        NUDGE_MAX_WAIT_MS,
      ),
    [],
  );
  useEffect(() => () => refresh.cancel(), [refresh]);

  return useRealtimeNudge(keyPrefix ? topic : null, refresh);
}
