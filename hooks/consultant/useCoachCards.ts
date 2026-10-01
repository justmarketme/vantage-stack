"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/consultant/client/api";
import { CoachEngine, type CardEvent, type CardHistoryEntry, type CoachEngineOptions } from "../../lib/consultant/client/coachEngine";
import { COACH_CARDS } from "../../lib/consultant/coach/cards";
import { inferStage } from "../../lib/consultant/coach/matcher";
import type { CoachCard, NepqStage, TranscriptSegment } from "../../lib/consultant/types";

/**
 * Live Coach Alex cards for a call.
 *
 *   const { active, queue, stage, critical, markUsed, dismiss, history } = useCoachCards(callId, segments);
 *
 * Runs the matcher only on NEW prospect segments (pure, client-side, <1ms).
 * Card events are batched to `POST calls/[id]/cards` every `flushMs`, and on
 * unmount / `pagehide` via `navigator.sendBeacon` (keepalive fetch fallback).
 * Re-renders only when the visible card state actually changes.
 */

export interface UseCoachCardsOptions extends CoachEngineOptions {
  /** Override the deck (tests / experiments). Must be a stable array. */
  cards?: CoachCard[];
  /** Event batch interval. Default 5s. */
  flushMs?: number;
}

export interface UseCoachCardsResult {
  active: (CoachCard & { heard: string }) | null;
  queue: CoachCard[];
  stage: NepqStage;
  markUsed: (id: string) => void;
  dismiss: (id: string) => void;
  history: CardHistoryEntry[];
  /** Additive: true while the active card is `high_risk` (UI may dim / flash). */
  critical: boolean;
}

const DEFAULT_FLUSH_MS = 5_000;

function beacon(callId: string, events: CardEvent[]): boolean {
  if (events.length === 0) return true;
  const body = JSON.stringify({ events });
  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(api.calls.cardsUrl(callId), new Blob([body], { type: "application/json" }));
      if (ok) return true;
    }
  } catch {
    /* fall through */
  }
  void api.calls.cards(callId, { events }, { keepalive: true, timeoutMs: 0 }).catch(() => undefined);
  return true;
}

export function useCoachCards(
  callId: string | null,
  segments: TranscriptSegment[],
  opts: UseCoachCardsOptions = {},
): UseCoachCardsResult {
  const cards = opts.cards ?? COACH_CARDS;
  const { cooldownMs, minReadMs, maxQueue } = opts;
  const flushMs = opts.flushMs ?? DEFAULT_FLUSH_MS;

  const engine = useMemo(
    () => new CoachEngine(cards, { cooldownMs, minReadMs, maxQueue }),
    // A new call gets a fresh engine (cooldowns + retired set are per call).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callId, cards],
  );
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  // Ingest new segments.
  useEffect(() => {
    if (!callId) return;
    if (engine.ingest(segments, Date.now())) bump();
  }, [callId, engine, segments, bump]);

  // Read-hold timer: promote a newer queued card once the hold lapses.
  useEffect(() => {
    const at = engine.nextTickAt();
    if (at === null) return;
    const t = setTimeout(() => {
      if (engine.tick(Date.now())) bump();
    }, Math.max(0, at - Date.now()) + 16);
    return () => clearTimeout(t);
  }, [engine, version, bump]);

  // Batched event delivery.
  const sending = useRef(false);
  useEffect(() => {
    if (!callId) return;
    const flush = async () => {
      if (sending.current || engine.pendingEvents === 0) return;
      const batch = engine.drainEvents(100);
      sending.current = true;
      try {
        await api.calls.cards(callId, { events: batch });
      } catch (e) {
        // Transient → retry next round; permanent (4xx) → drop, it's analytics.
        const status = (e as { status?: number })?.status ?? 0;
        if (status === 0 || status === 408 || status === 429 || status >= 500) engine.requeueEvents(batch);
      } finally {
        sending.current = false;
      }
    };
    const interval = setInterval(() => void flush(), flushMs);
    const onPageHide = () => {
      while (engine.pendingEvents > 0) beacon(callId, engine.drainEvents(100));
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
      onPageHide();
    };
  }, [callId, engine, flushMs]);

  const markUsed = useCallback(
    (id: string) => {
      if (engineRef.current.markUsed(id, Date.now())) bump();
    },
    [bump],
  );
  const dismiss = useCallback(
    (id: string) => {
      if (engineRef.current.dismiss(id, Date.now())) bump();
    },
    [bump],
  );

  // Stage inference is O(segments); recompute only when the list grows.
  const segCount = segments.length;
  const stage = useMemo(
    () => inferStage(segments),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [segCount, callId],
  );

  const a = engine.active;
  const active = useMemo(
    () => (a ? { ...a.card, heard: a.heard } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a?.card, a?.heard, a?.shownAt],
  );
  const queue = useMemo(
    () => engine.queue.map((q) => q.card),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, version],
  );

  return {
    active,
    queue,
    stage,
    markUsed,
    dismiss,
    history: engine.history,
    critical: engine.critical,
  };
}
