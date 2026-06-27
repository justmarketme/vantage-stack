"use client";

// Desktop-only ambient PRESENCE: Isabel's chroma-keyed standing hologram beside
// the blueprint — the LIVE-session presence (she "points" at the form as she
// guides). It appears only once the session begins (after blueprint:start-voice)
// so it never shows at the same time as the lip-synced welcome card, and it
// unmounts on session end so a re-run starts clean.

import { useEffect, useState } from "react";
import { IsabelOverlay } from "./IsabelOverlay";

export function IsabelIntro({ className = "" }: { className?: string }) {
  // Reactive (not a one-shot snapshot) so a resize/rotation across 1280px keeps
  // this in step with the talking-intro, which reads the breakpoint live.
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
  useEffect(() => {
    const on = () => setActive(true);
    const off = () => setActive(false);
    window.addEventListener("blueprint:start-voice", on);
    window.addEventListener("blueprint:intro-play", off); // a fresh start hides the old hologram
    window.addEventListener("blueprint:session-ended", off);
    return () => {
      window.removeEventListener("blueprint:start-voice", on);
      window.removeEventListener("blueprint:intro-play", off);
      window.removeEventListener("blueprint:session-ended", off);
    };
  }, []);

  if (!desktop || !active) return null;
  return (
    <div className={className}>
      <IsabelOverlay className="pointer-events-none h-full w-full" />
    </div>
  );
}
