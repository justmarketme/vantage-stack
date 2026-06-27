"use client";

// Desktop-only ambient PRESENCE: Isabel's chroma-keyed hologram stands beside the
// blueprint. Deliberately NO buttons/cues/voiceover here — the single entry point
// is the hero's "Start with Isabel" CTA, and the live session + slim live bar take
// it from there. Phones get a lightweight poster band (in page.tsx) instead of the
// WebGL shader, so it never runs on a phone GPU.

import { useState } from "react";
import { IsabelOverlay } from "./IsabelOverlay";

export function IsabelIntro({ className = "" }: { className?: string }) {
  const [mobile] = useState(
    () => typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches,
  );
  if (mobile) return null;
  return (
    <div className={className}>
      <IsabelOverlay className="pointer-events-none h-full w-full" />
    </div>
  );
}
