"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { cueFor, detectOutput, pickVoice, type OutputKind } from "../../lib/consultant/client/coachAudio";
import { PREFS_PERSIST_NAME, prefsStore } from "../../lib/consultant/client/prefs";
import type { CoachCard } from "../../lib/consultant/types";

/**
 * Optional Coach Alex audio cues — a short spoken hint ("Objection: too
 * expensive") when a NEW high-risk or stall card appears during a call.
 *
 *   // Settings page
 *   const audio = useCoachAudio(null);
 *   <Toggle checked={audio.enabled} onChange={audio.setEnabled} />
 *   {audio.enabled && audio.output !== "headset" && (
 *     <Checkbox checked={audio.headsetConfirmed} onChange={audio.confirmHeadset} label="I'm wearing a headset" />)}
 *
 *   // Live call
 *   useCoachAudio(active, callId);   // `active` from useCoachCards
 *
 * Safety rules (a cue through laptop speakers would be heard by the clinic):
 * - OFF by default; the on/off choice is remembered on this device.
 * - Speaks only when a headset/Bluetooth output is detected (best effort via
 *   `enumerateDevices`) OR the rep confirmed "I'm wearing a headset" in this
 *   sitting. The confirmation is never persisted and is cleared whenever audio
 *   devices change (headset unplugged).
 * - Never overlapping: if a cue is still playing, a new one is dropped (a
 *   stale cue is worse than none), with at least 4s between cues. Each card
 *   speaks at most once per call. Quiet (volume 0.6), slightly quick (rate 1.1).
 * - Web Speech `speechSynthesis`, en-ZA voice when the device has one.
 * - Nothing is logged; cue text comes from the card title, never the transcript.
 */

export const CUE_MIN_GAP_MS = 4_000;
const CUE_VOLUME = 0.6;
const CUE_RATE = 1.1;

export interface UseCoachAudioResult {
  /** Web Speech synthesis exists in this browser. */
  supported: boolean;
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  /** What the default audio output looks like. */
  output: OutputKind;
  headsetConfirmed: boolean;
  confirmHeadset: (yes: boolean) => void;
  /** Cues will actually play right now. */
  canSpeak: boolean;
  /** Play a sample cue (e.g. a "Test" button — also unlocks audio on iOS). */
  test: () => void;
}

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

export function useCoachAudio(active: Pick<CoachCard, "id" | "severity" | "title"> | null, callId?: string | null): UseCoachAudioResult {
  const enabled = useStore(prefsStore, (s) => s.coachAudio);
  const setEnabled = useStore(prefsStore, (s) => s.setCoachAudio);
  const [supported, setSupported] = useState(false);
  const [output, setOutput] = useState<OutputKind>("unknown");
  const [headsetConfirmed, setHeadsetConfirmed] = useState(false);
  const lastCueAt = useRef(0);
  const spoken = useRef(new Set<string>());

  useEffect(() => setSupported(synth() !== null), []);

  // Other tabs toggling the preference.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PREFS_PERSIST_NAME) void prefsStore.persist.rehydrate();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Output detection; re-run when devices change, and drop any confirmation then.
  useEffect(() => {
    if (!enabled) return;
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md || typeof md.enumerateDevices !== "function") {
      setOutput("unknown");
      return;
    }
    let cancelled = false;
    const check = () =>
      md
        .enumerateDevices()
        .then((list) => {
          if (!cancelled) setOutput(detectOutput(list.map((d) => ({ kind: d.kind, label: d.label, deviceId: d.deviceId }))));
        })
        .catch(() => !cancelled && setOutput("unknown"));
    const onChange = () => {
      setHeadsetConfirmed(false);
      void check();
    };
    void check();
    md.addEventListener?.("devicechange", onChange);
    return () => {
      cancelled = true;
      md.removeEventListener?.("devicechange", onChange);
    };
  }, [enabled]);

  const canSpeak = supported && enabled && (output === "headset" || headsetConfirmed);

  const say = useCallback((text: string, force = false) => {
    const s = synth();
    if (!s) return;
    const now = Date.now();
    if (!force && (s.speaking || s.pending || now - lastCueAt.current < CUE_MIN_GAP_MS)) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      const voice = pickVoice(s.getVoices());
      if (voice) {
        u.voice = voice;
        u.lang = voice.lang;
      } else u.lang = "en-ZA";
      u.volume = CUE_VOLUME;
      u.rate = CUE_RATE;
      lastCueAt.current = now;
      if (force) s.cancel();
      s.speak(u);
    } catch {
      /* speech is a nice-to-have; never break the call screen */
    }
  }, []);

  // New call → every card may cue once again.
  useEffect(() => {
    spoken.current = new Set();
  }, [callId]);

  const activeId = active?.id ?? null;
  useEffect(() => {
    if (!canSpeak || !active || spoken.current.has(active.id)) return;
    const cue = cueFor(active);
    if (!cue) return;
    spoken.current.add(active.id);
    say(cue);
    // Only a change of card should trigger a cue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, canSpeak, say]);

  // Turning cues off, or leaving the call screen, silences anything queued.
  useEffect(() => {
    if (!canSpeak) synth()?.cancel();
  }, [canSpeak]);
  useEffect(() => () => synth()?.cancel(), []);

  const test = useCallback(() => say("Coach Alex cues are on", true), [say]);

  return {
    supported,
    enabled,
    setEnabled,
    output,
    headsetConfirmed,
    confirmHeadset: setHeadsetConfirmed,
    canSpeak,
    test,
  };
}
