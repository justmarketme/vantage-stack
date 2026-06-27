"use client";

// The lip-synced WELCOME — a brief, premium "Isabel greets you" moment that
// plays ONCE with her real voice (Hedra video, voiced by the same ElevenLabs
// voice as the live agent), then hands off seamlessly to the live guided session.
//
// Flow:
//   hero "Start with Isabel" CTA  →  blueprint:intro-play
//     → we call video.play() SYNCHRONOUSLY in that click's task (so the audio
//       inherits the user gesture); only once playback truly starts do we reveal
//       the dim welcome card, start the ambient music (ducked under her voice),
//       and focus the Skip button
//     → on ended / Skip / Escape → hand off: fire
//       blueprint:start-voice { afterIntro: true } so the LIVE agent (same voice)
//       picks up mid-breath with the first question, scroll to the form.
//
// GRACEFUL: if the clip is missing/blocked/slow, or on mobile / reduced-motion,
// we never show the card — we go straight to the live agent with the FULL
// greeting (afterIntro: false), i.e. exactly today's behaviour.

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ISABEL_INTRO_TRANSCRIPT } from "../../lib/isabel/persona";

const TALK_SRC = "/videos/isabel_intro_talk.mp4";
const STALL_MS = 6000; // backstop: if play() never resolves/rejects, fall through

export function IsabelTalkingIntro() {
  const [visible, setVisible] = useState(false); // dim card shown (clip truly playing)
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skipRef = useRef<HTMLButtonElement | null>(null);
  const handedOffRef = useRef(false);
  const activeRef = useRef(false); // an intro attempt is in flight (single-flight guard)
  const visibleRef = useRef(false); // mirror of `visible` for the stall closure

  // Go straight to the live agent with the FULL greeting (mobile / reduced-motion
  // / no clip). No detail → afterIntro falsy → full first message.
  const skipToLive = useCallback(() => {
    window.dispatchEvent(new CustomEvent("blueprint:start-voice"));
    document.getElementById("blueprint-deck")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Single exit point once the clip has begun: stop the clip, un-duck, hide the
  // card, start the live agent (skipping its greeting), scroll to the form.
  const handoff = useCallback((afterIntro: boolean) => {
    if (handedOffRef.current) return;
    handedOffRef.current = true;
    activeRef.current = false;
    const v = videoRef.current;
    if (v) { try { v.pause(); } catch { /* noop */ } }
    window.dispatchEvent(new CustomEvent("isabel:speaking", { detail: { speaking: false } }));
    setVisible(false);
    window.dispatchEvent(new CustomEvent("blueprint:start-voice", { detail: { afterIntro } }));
    document.getElementById("blueprint-deck")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // ended/error live on the <video> for its whole life — attached ONCE so a
  // reveal re-render can't tear them off (that bug stranded the card forever).
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onEnded = () => handoff(true);
    const onError = () => handoff(false);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    return () => {
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [handoff]);

  useEffect(() => {
    const onPlay = () => {
      if (activeRef.current || handedOffRef.current) return; // ignore double-clicks
      const desktop = window.matchMedia("(min-width: 1280px)").matches;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const v = videoRef.current;
      if (!desktop || reduce || !v) { skipToLive(); return; }

      activeRef.current = true;
      // Pre-warm the mic NOW, under the live gesture, so the permission prompt
      // appears with the click (not abruptly ~15s later at handoff).
      window.dispatchEvent(new CustomEvent("blueprint:prewarm-mic"));

      v.muted = false;
      try { v.currentTime = 0; } catch { /* noop */ }
      const stall = window.setTimeout(() => {
        if (!handedOffRef.current && !visibleRef.current) handoff(false);
      }, STALL_MS);

      // play() IN THE CLICK TASK so audio keeps the user activation. Reveal only
      // once it genuinely starts; any rejection (autoplay block / 404 / decode)
      // falls straight through to the live agent.
      v.play().then(() => {
        window.clearTimeout(stall);
        if (handedOffRef.current) return;
        setVisible(true);
        window.dispatchEvent(new CustomEvent("blueprint:start-music"));
        // Duck the ambient track under her recorded voice (the live `isSpeaking`
        // flow isn't connected yet during the clip).
        window.dispatchEvent(new CustomEvent("isabel:speaking", { detail: { speaking: true } }));
        requestAnimationFrame(() => skipRef.current?.focus());
      }).catch(() => {
        window.clearTimeout(stall);
        handoff(false);
      });
    };
    window.addEventListener("blueprint:intro-play", onPlay);
    return () => window.removeEventListener("blueprint:intro-play", onPlay);
  }, [handoff, skipToLive]);

  // Mirror `visible` into a ref for the stall closure above.
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  // While the welcome is up, hide the page behind it from assistive tech.
  useEffect(() => {
    const main = typeof document !== "undefined" ? document.querySelector("main") : null;
    if (visible) main?.setAttribute("aria-hidden", "true");
    else main?.removeAttribute("aria-hidden");
    return () => main?.removeAttribute("aria-hidden");
  }, [visible]);

  // Trap focus on Skip (the only control) and let Escape dismiss.
  const onKeyDown = useCallback((e: ReactKeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); handoff(true); }
    else if (e.key === "Tab") { e.preventDefault(); skipRef.current?.focus(); }
  }, [handoff]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Isabel's welcome"
      onKeyDown={onKeyDown}
      className={`fixed inset-0 z-40 flex items-center justify-center p-4 transition-opacity duration-300 ${
        visible ? "bg-black/65 opacity-100 backdrop-blur-sm" : "pointer-events-none opacity-0"
      }`}
      style={{ visibility: visible ? "visible" : "hidden" }}
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#0b0b0c] shadow-[0_30px_90px_rgba(0,0,0,0.8)]">
        {/* Always mounted (preload=none → no fetch until we play) so play() can run
            synchronously inside the CTA gesture and keep its audio activation. */}
        <video
          ref={videoRef}
          src={TALK_SRC}
          preload="none"
          playsInline
          aria-label="Isabel welcomes you to your growth blueprint"
          className="aspect-square w-full bg-black object-cover"
        />
        {/* Visible transcript — captions for deaf/HoH users (WCAG 1.2.2). */}
        <p className="px-4 py-3 text-xs leading-relaxed text-textMuted">{ISABEL_INTRO_TRANSCRIPT}</p>
        <button
          ref={skipRef}
          onClick={() => handoff(true)}
          className="absolute right-3 top-3 rounded-lg bg-black/55 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-sm transition hover:bg-black/70 hover:text-white"
        >
          Skip intro →
        </button>
      </div>
    </div>
  );
}
