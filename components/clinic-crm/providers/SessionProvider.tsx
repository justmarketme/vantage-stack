"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiClientError, UNAUTHORIZED_EVENT, api } from "../../../lib/clinic-crm/client/api";
import { clearQueryCache, setCacheScope } from "../../../lib/clinic-crm/client/query";
import type { Session } from "../../../lib/clinic-crm/types";

export const LOGIN_PATH = "/clinic-crm/login";

export interface SessionContextValue {
  session: Session | null;
  loading: boolean;
  /** Re-read `auth/me` (call after a successful login). */
  refresh: () => Promise<Session | null>;
  /** Server logout + local wipe + redirect to login. */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const adopt = useCallback((s: Session | null) => {
    setCacheScope(s?.clinicId ?? null);
    setSession(s);
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.auth.me();
      adopt(s);
      return s;
    } catch (e) {
      // 401 is handled by the unauthorized listener; other failures (offline) keep us signed-out-ish
      // without wiping anything, so a flaky network doesn't log staff out.
      if (e instanceof ApiClientError && e.status === 401) adopt(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [adopt]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearQueryCache();
      adopt(null);
      if (!pathRef.current?.startsWith(LOGIN_PATH)) router.replace(LOGIN_PATH);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [adopt, router]);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      /* local wipe below still happens */
    }
    clearQueryCache();
    adopt(null);
    router.replace(LOGIN_PATH);
  }, [adopt, router]);

  const value = useMemo(() => ({ session, loading, refresh, signOut }), [session, loading, refresh, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <ClinicProviders>");
  return ctx;
}
