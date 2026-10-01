"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { UNAUTHORIZED_EVENT } from "../../../lib/consultant/client/api";
import { useOnline } from "../../../hooks/consultant/useOnline";
import { useOutbox } from "../../../hooks/consultant/useOutbox";
import { useCardDeckWarmup } from "../../../hooks/consultant/useCardDeckWarmup";
import { useServiceWorker } from "../../../hooks/consultant/useServiceWorker";
import { MeProvider, useMe } from "../MeProvider";
import { VoiceCallProvider } from "../VoiceCallProvider";
import { CoachFloat } from "../coach/CoachFloat";
import { ErrorState } from "../ui";
import { countOf, describeError, errorStatus } from "../utils";
import { BottomTabs, SideRail } from "./ConsultantNav";
import { OfflineBanner, OnCallBar } from "./StatusBanners";

/**
 * The Consultant Portal frame. Owns everything that must survive navigation:
 * who's signed in, the voice call + Coach Alex (VoiceCallProvider), and the
 * offline/outbox status. The live-call route is immersive — no nav chrome.
 */
export function ConsultantShell({ children }: { children: ReactNode }) {
  return (
    <div className="cp-theme min-h-[100dvh] font-body">
      <MeProvider>
        <VoiceCallProvider>
          <Frame>{children}</Frame>
        </VoiceCallProvider>
      </MeProvider>
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/consultant";
  const router = useRouter();
  const online = useOnline();
  const { pending } = useOutbox();
  const { me, error: meError, refresh: refreshMe } = useMe();
  useCardDeckWarmup();
  // Offline-first: caches the portal shell + static chunks so it opens with no signal.
  const sw = useServiceWorker();

  // 401 anywhere → sign in again and come straight back here.
  useEffect(() => {
    const onUnauthorized = () => {
      const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : pathname;
      router.replace(`/admin/login?next=${encodeURIComponent(next)}`);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router, pathname]);

  const immersive = pathname.startsWith("/consultant/call/");
  const pendingCount = countOf(pending);

  const forbidden = errorStatus(meError) === 403;

  return (
    <>
      <a
        href="#cp-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-lg focus:bg-[--cp-surface] focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      {!immersive && <SideRail pathname={pathname} userName={me?.displayName} me={me} />}
      <div className={immersive ? undefined : "lg:pl-[88px]"}>
        <div className="sticky top-0 z-20" style={{ paddingTop: immersive ? undefined : "var(--cp-safe-top)" }}>
          <OfflineBanner online={online} pending={pendingCount} />
          {sw.updateReady && (
            <div role="status" className="flex items-center justify-between gap-3 bg-[--cp-accent-soft] px-4 py-2 text-sm text-[--cp-text]">
              <span>A new version of the portal is ready.</span>
              <button type="button" onClick={() => sw.applyUpdate()} className="min-h-[44px] rounded-lg px-3 font-medium text-[--cp-accent-text]">
                Update now
              </button>
            </div>
          )}
        </div>
        <main
          id="cp-main"
          className={
            immersive
              ? undefined
              : "mx-auto w-full max-w-6xl px-4 pb-[calc(9rem+var(--cp-safe-bottom))] pt-5 md:px-6 lg:px-8 lg:pb-12 lg:pt-8"
          }
        >
          {forbidden ? (
            <ErrorState message="Your account doesn't have access to the Consultant Portal. Ask an admin to give you the consultant role." />
          ) : meError && !me ? (
            <ErrorState message={describeError(meError, "load")} onRetry={() => void refreshMe()} />
          ) : (
            children
          )}
        </main>
      </div>
      {!immersive && <OnCallBar />}
      {!immersive && <BottomTabs pathname={pathname} me={me} />}
      {!immersive && <CoachFloat />}
    </>
  );
}
