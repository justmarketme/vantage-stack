"use client";

// Track E — calm ambient background music for the guided /blueprint experience,
// with a visible mute/volume control. Click-to-start (browsers block autoplay
// with sound), fades in/out, loops, VERY low default volume, and automatically
// DUCKS (drops further) whenever Isabel is speaking so it never competes with
// her voice. It listens for a window "isabel:speaking" CustomEvent, which
// IsabelWidget dispatches from the ConvAI `isSpeaking` state.
//
// ⚠️ LICENSING: public/audio/blueprint-ambient.mp3 was generated on Suno's FREE
// plan, which does NOT grant commercial rights. Before go-live, either upgrade
// the Suno song to Pro/Premier (commercial licence) or swap in a royalty-free
// loop. This component reads the src prop, so swapping the file is a one-liner.

import { useCallback, useEffect, useRef, useState } from "react";
import { BLUEPRINT_TOOL_EVENT, type BlueprintToolDetail } from "../../lib/blueprint/voice-tools";

const DEFAULT_SRC = "/audio/blueprint-ambient.mp3";
const BASE_VOLUME = 0.1; // very soft background level when Isabel is silent
const DUCK_VOLUME = 0.03; // barely-there level while Isabel speaks
const FADE_MS = 1100;
const DUCK_MS = 320; // duck down quickly when she starts talking
const RESTORE_MS = 700; // ease back up when she stops

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function BlueprintAmbientAudio({ src = DEFAULT_SRC }: { src?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const speakingRef = useRef(false);
  const userStoppedRef = useRef(false); // user deliberately muted — don't auto-restart over them
  const [playing, setPlaying] = useState(false);
  const [pulse, setPulse] = useState(false); // brief glow when Isabel touches the button

  const clearFade = () => {
    if (fadeRef.current !== null) {
      window.clearInterval(fadeRef.current);
      fadeRef.current = null;
    }
  };

  const fadeTo = useCallback((target: number, ms = FADE_MS, onDone?: () => void) => {
    const audio = audioRef.current;
    if (!audio) return;
    clearFade();
    if (prefersReducedMotion() || ms <= 0) {
      audio.volume = target;
      onDone?.();
      return;
    }
    const start = audio.volume;
    const steps = Math.max(1, Math.round(ms / 50));
    let step = 0;
    fadeRef.current = window.setInterval(() => {
      step += 1;
      const v = start + (target - start) * (step / steps);
      audio.volume = Math.min(1, Math.max(0, v));
      if (step >= steps) {
        clearFade();
        onDone?.();
      }
    }, 50);
  }, []);

  // Current intended volume given play + Isabel-speaking state.
  const intendedVolume = () => (!playingRef.current ? 0 : speakingRef.current ? DUCK_VOLUME : BASE_VOLUME);

  const playMusic = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || playingRef.current) return;
    try {
      audio.muted = false;
      audio.volume = 0;
      await audio.play();
      playingRef.current = true;
      setPlaying(true);
      fadeTo(intendedVolume());
    } catch {
      /* user gesture required or autoplay blocked — leave paused */
    }
  }, [fadeTo]);

  const stopMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !playingRef.current) return;
    playingRef.current = false;
    setPlaying(false);
    fadeTo(0, FADE_MS, () => audio.pause());
  }, [fadeTo]);

  const toggle = useCallback(() => {
    if (playingRef.current) { userStoppedRef.current = true; stopMusic(); }
    else { userStoppedRef.current = false; void playMusic(); }
  }, [playMusic, stopMusic]);

  // Isabel can play/stop the music by voice (controlBlueprintMusic tool) and the
  // button pulses so the user sees what she's doing. An explicit request from her
  // (or the user) overrides a prior mute.
  useEffect(() => {
    function onTool(e: Event) {
      const d = (e as CustomEvent<BlueprintToolDetail>).detail;
      if (!d || d.tool !== "music") return;
      if (d.action === "stop") { userStoppedRef.current = true; stopMusic(); }
      else { userStoppedRef.current = false; void playMusic(); }
      setPulse(true);
      window.setTimeout(() => setPulse(false), 1600);
    }
    window.addEventListener(BLUEPRINT_TOOL_EVENT, onTool as EventListener);
    return () => window.removeEventListener(BLUEPRINT_TOOL_EVENT, onTool as EventListener);
  }, [playMusic, stopMusic]);

  // Duck the music while Isabel speaks; restore when she stops.
  useEffect(() => {
    function onSpeaking(e: Event) {
      const speaking = Boolean((e as CustomEvent<{ speaking?: boolean }>).detail?.speaking);
      if (speaking === speakingRef.current) return;
      speakingRef.current = speaking;
      if (playingRef.current) fadeTo(intendedVolume(), speaking ? DUCK_MS : RESTORE_MS);
    }
    window.addEventListener("isabel:speaking", onSpeaking as EventListener);
    return () => window.removeEventListener("isabel:speaking", onSpeaking as EventListener);
  }, [fadeTo]);

  // Start the music when Isabel's voice session connects (the user's click to
  // talk is the gesture that allows playback).
  useEffect(() => {
    const onStart = () => { if (!userStoppedRef.current) void playMusic(); };
    window.addEventListener("blueprint:start-music", onStart);
    return () => window.removeEventListener("blueprint:start-music", onStart);
  }, [playMusic]);

  useEffect(() => () => clearFade(), []);

  return (
    <>
      {/* preload="none" keeps the ~4.5MB track off the initial page load — it
          only fetches when the user presses play. */}
      <audio ref={audioRef} src={src} preload="none" loop />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? "Mute background music" : "Play calm background music"}
        title={playing ? "Mute background music" : "Play calm background music"}
        className={`vs-fab-bottom fixed bottom-6 left-4 sm:left-6 z-40 flex h-11 w-11 items-center justify-center rounded-xl border bg-[#17171f]/90 shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur transition-all hover:border-accent/40 hover:text-accent ${
          pulse
            ? "scale-110 border-accent/70 text-accent shadow-[0_0_26px_6px_rgba(56,189,248,0.45)]"
            : "border-white/10 text-textMuted"
        }`}
      >
        {playing ? (
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H2v6h4l5 4V5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8 8 0 0 1 0 12" />
          </svg>
        ) : (
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H2v6h4l5 4V5z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="m23 9-6 6M17 9l6 6" />
          </svg>
        )}
      </button>
    </>
  );
}
