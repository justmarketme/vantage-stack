"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { api } from "../../lib/consultant/client/api";
import { useQuery } from "../../hooks/consultant/useQuery";
import type { Me } from "../../lib/consultant/types";

type MeState = {
  me: Me | undefined;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
};

const MeContext = createContext<MeState>({
  me: undefined,
  loading: true,
  error: null,
  refresh: () => Promise.resolve(),
});

/** Who is signed in, and what they may do. Drives role-based views (Norman). */
export function MeProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, refresh } = useQuery<Me>("me", () => api.me());
  const value = useMemo(() => ({ me: data, loading, error, refresh }), [data, loading, error, refresh]);
  return <MeContext.Provider value={value}>{children}</MeContext.Provider>;
}

export function useMe(): MeState {
  return useContext(MeContext);
}

/** Why this person can't place calls, or null if they can. */
export function callBlockReason(me: Me | undefined, online: boolean): string | null {
  if (!online) return "You're offline — calls need a connection.";
  if (!me) return "Loading your profile…";
  if (!me.canCall) return "Read-only access: sign in with your consultant account to call.";
  return null;
}
