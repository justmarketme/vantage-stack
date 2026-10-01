"use client";

import { useEffect, useRef, useState } from "react";
import { nudgeHub, topicName, type NudgeTopic, type RealtimeStatus } from "../../lib/consultant/client/realtime";

/**
 * Call `onNudge` whenever the server says "something changed" on a topic.
 *
 *   const realtime = useRealtimeNudge({ callId }, () => refetchNow());
 *   const realtime = useRealtimeNudge("leaderboard", () => refresh());
 *   // realtime: "connecting" | "live" | "unavailable"
 *
 * - `topic: null` disables it (returns "unavailable").
 * - Nudges carry no data: refetch through the authed API in `onNudge`.
 * - Use the returned status to pick a polling interval: poll slowly as a
 *   backstop while "live", at the normal rate otherwise. Missing env
 *   (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`), a blocked
 *   socket or a channel error all read as "unavailable" — polling carries on.
 * - supabase-js is imported lazily on first use (not in the first-paint bundle).
 * - `onNudge` may change every render; the subscription doesn't churn.
 */
export function useRealtimeNudge(topic: NudgeTopic | null, onNudge: () => void): RealtimeStatus {
  const cb = useRef(onNudge);
  cb.current = onNudge;
  const name = topic ? topicName(topic) : null;
  const [status, setStatus] = useState<RealtimeStatus>(name ? "connecting" : "unavailable");

  useEffect(() => {
    if (!name) {
      setStatus("unavailable");
      return;
    }
    setStatus("connecting");
    return nudgeHub().subscribe(name, {
      onNudge: () => cb.current(),
      onStatus: setStatus,
    });
  }, [name]);

  return status;
}
