"use client";

// Desktop-only PRESENCE — the REAL olive Isabel (her actual face), full-body,
// keyed TRANSPARENT (VP9/alpha webm) with a gentle living motion, so she stands
// beside the blueprint and blends straight into the dark page — no card, no
// background. The live agent does the talking; she's the visual presence.
//
// The hero CTA (blueprint:intro-play) fades her in and starts the live session
// (full greeting). Mobile / reduced-motion → straight to the live agent (poster
// band only), no heavy video.

import { useEffect, useRef, useState } from "react";

const SRC = "/videos/isabel-fullbody.webm";

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

  useEffect(() => {
    const onPlay = () => {
      window.dispatchEvent(new CustomEvent("blueprint:start-voice"));
      document.getElementById("blueprint-deck")?.scrollIntoView({ behavior: "smooth", block: "start" });
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!window.matchMedia("(min-width: 1280px)").matches) return;
      setActive(true);
      if (!reduce) videoRef.current?.play().catch(() => {}); // reduced-motion → static frame
    };
    window.addEventListener("blueprint:intro-play", onPlay);
    return () => window.removeEventListener("blueprint:intro-play", onPlay);
  }, []);

  if (!desktop) return null;
  return (
    <div className={`${className} transition-opacity duration-700 ${active ? "opacity-100" : "opacity-0"}`}>
      {/* Transparent VP9 alpha clip — the page shows through, so she stands in the
          corner with no frame. Muted, looping subtle motion. */}
      <video ref={videoRef} src={SRC} muted loop playsInline preload="auto" className="h-full w-full object-contain object-bottom" />
    </div>
  );
}
