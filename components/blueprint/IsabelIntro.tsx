"use client";

// Premium /blueprint intro. Isabel is present (the chroma-keyed hologram), and
// on one tap — "Meet Isabel" — her voiceover (Cay's exact voice) plays while she
// stands and welcomes; when it finishes she dissolves smoothly and the chat CTA
// is cued. One tap satisfies the browser audio-gesture requirement AND makes the
// "click to talk to her" path obvious. No lip-sync needed: the clip has her
// smiling/gesturing with her mouth closed, so the voiceover reads as a present
// host, not mismatched speech.

import { useEffect, useRef, useState } from "react";
import { IsabelOverlay } from "./IsabelOverlay";

const INTRO_AUDIO = "/audio/isabel-intro.mp3";

type Phase = "idle" | "playing" | "fading" | "gone";

export function IsabelIntro({ className = "" }: { className?: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  // Desktop-only: phones get a lightweight poster band (in page.tsx) instead of
  // the WebGL hologram, so the chroma shader never runs on a phone GPU.
  const [mobile] = useState(() => typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches);

  // After the dissolve, unmount so the WebGL loop stops.
  useEffect(() => {
    if (phase !== "fading") return;
    const t = window.setTimeout(() => setPhase("gone"), 1000);
    return () => window.clearTimeout(t);
  }, [phase]);

  const start = () => {
    const audio = audioRef.current;
    setPhase("playing");
    if (audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    }
  };

  const finish = () => {
    setPhase("fading");
    // Cue the chat: tell the widget to draw attention to "Talk to Isabel".
    window.dispatchEvent(new CustomEvent("blueprint:intro-done"));
  };

  if (mobile || phase === "gone") return null;

  const fading = phase === "fading";
  return (
    <div className={className}>
      <audio ref={audioRef} src={INTRO_AUDIO} preload="auto" onEnded={finish} />
      <div
        className="relative h-full w-full transition-all duration-1000 ease-out"
        style={{ opacity: fading ? 0 : 1, transform: fading ? "translateY(-8px) scale(1.05)" : "none" }}
      >
        <IsabelOverlay className="pointer-events-none h-full w-full" />

        {phase === "idle" && (
          <div className="absolute bottom-[10%] left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
            {/* Witty nudge — she's pointing right here */}
            <div className="pointer-events-none animate-bounce rounded-full border border-accent/30 bg-[#0B0B0C]/80 px-3 py-1 text-[11px] font-medium text-accent/90 backdrop-blur">
              Psst — tap to meet me 👇
            </div>
            <button
              type="button"
              onClick={start}
              className="pointer-events-auto group flex items-center gap-2.5 rounded-full border border-accent/40 bg-[#0B0B0C]/70 px-5 py-2.5 text-sm font-semibold text-textPrimary shadow-[0_0_30px_rgba(56,189,248,0.25)] backdrop-blur transition-all hover:border-accent/70 hover:shadow-[0_0_44px_rgba(56,189,248,0.45)]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white shadow-lg shadow-accent/30">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              Meet Isabel
            </button>
          </div>
        )}

        {phase === "playing" && (
          <div className="pointer-events-none absolute bottom-[10%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#0B0B0C]/65 px-4 py-2 text-xs font-medium text-accent/90 backdrop-blur">
            <span className="flex items-end gap-[3px]">
              <span className="h-2.5 w-[3px] animate-pulse rounded-full bg-accent" />
              <span className="h-4 w-[3px] animate-pulse rounded-full bg-accent [animation-delay:140ms]" />
              <span className="h-2 w-[3px] animate-pulse rounded-full bg-accent [animation-delay:280ms]" />
            </span>
            Isabel is speaking…
          </div>
        )}
      </div>
    </div>
  );
}
