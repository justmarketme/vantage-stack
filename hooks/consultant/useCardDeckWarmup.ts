"use client";

import { useEffect } from "react";
import { COACH_CARDS } from "../../lib/consultant/coach/cards";
import { precompileDeck } from "../../lib/consultant/coach/matcher";
import type { CoachCard } from "../../lib/consultant/types";

/**
 * Pre-compile the Coach Alex deck while the browser is idle, so the first
 * live-call utterance matches instantly. The deck is bundled static data — no
 * network, works offline. Compilation is memoised per array identity, so
 * calling this from several layouts is free after the first run.
 */
export function useCardDeckWarmup(cards: CoachCard[] = COACH_CARDS): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const run = () => {
      try {
        precompileDeck(cards);
      } catch {
        /* a malformed card must never break the layout */
      }
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(run, { timeout: 2_000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(run, 200);
    return () => clearTimeout(t);
  }, [cards]);
}
