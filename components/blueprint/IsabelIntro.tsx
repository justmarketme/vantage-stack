"use client";

// Desktop-only PRESENCE — the REAL olive Isabel, AI-lip-synced to her own
// ElevenLabs voice and keyed TRANSPARENT (VP9/alpha webm), so she blends straight
// into the dark blueprint with no card or background.
//
// She's LIVE-DRIVEN: her mouth animates only while the live agent is actually
// speaking (the `isabel:speaking` event), and rests when she's listening — so the
// transparent video tracks the real voice's rhythm and reads as one person.
//
// The hero CTA (blueprint:intro-play) reveals her + starts the live session
// (full greeting). Mobile / reduced-motion → straight to the live agent, no video.

import { useEffect, useRef, useState } from "react";

const TALK_SRC = "/videos/isabel-talk.webm";

export function IsabelIntro({ className = "" }: { className?: string }) {
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const [active, setActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Hero CTA → start the live session (full greeting) + reveal the presence.
  useEffect(() => {
    const onPlay = () => {
      window.dispatchEvent(new CustomEvent("blueprint:start-voice"));
      document.getElementById("blueprint-deck")?.scrollIntoView({ behavior: "smooth", block: "start" });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (window.matchMedia("(min-width: 1280px)").matches && !reduce) setActive(true);
    };
    window.addEventListener("blueprint:intro-play", onPlay);
    return () => window.removeEventListener("blueprint:intro-play", onPlay);
  }, []);

  // Animate her mouth only while the live agent speaks; settle to a neutral frame
  // when she's listening.
  useEffect(() => {
    const onSpeaking = (e: Event) => {
      const v = videoRef.current;
      if (!v) return;
      const speaking = Boolean((e as CustomEvent<{ speaking?: boolean }>).detail?.speaking);
      if (speaking) {
        v.play().catch(() => {});
      } else {
        v.pause();
        try { v.currentTime = 0; } catch { /* noop */ }
      }
    };
    window.addEventListener("isabel:speaking", onSpeaking as EventListener);
    return () => window.removeEventListener("isabel:speaking", onSpeaking as EventListener);
  }, []);

  if (!desktop) return null;
  return (
    <div className={`${className} transition-opacity duration-700 ${active ? "opacity-100" : "opacity-0"}`}>
      {/* Transparent VP9 alpha clip — the page shows through, so she floats in the
          corner with no frame. muted/loop; play/pause is driven by isabel:speaking. */}
      <video ref={videoRef} src={TALK_SRC} muted loop playsInline preload="auto" className="h-full w-full object-contain object-bottom" />
    </div>
  );
}
