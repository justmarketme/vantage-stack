"use client";

// Desktop-only ambient PRESENCE: a framed portrait of the (olive, canonical)
// Isabel sits beside the blueprint like a friendly video-call tile — the SAME
// Isabel as the avatar/poster everywhere, so she's consistent. It slides in once
// the live session begins, glows gently while she's speaking, and tucks away when
// the session ends. (Phones get the poster band in page.tsx instead.)

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

export function IsabelIntro() {
  // Reactive so a resize across 1280px keeps step with the rest of the choreography.
  const [desktop, setDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1280px)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setDesktop(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Present only during the live session (after blueprint:start-voice), hidden on
  // a fresh intro or when the session ends.
  const [active, setActive] = useState(false);
  useEffect(() => {
    const on = () => setActive(true);
    const off = () => setActive(false);
    window.addEventListener("blueprint:start-voice", on);
    window.addEventListener("blueprint:intro-play", off);
    window.addEventListener("blueprint:session-ended", off);
    return () => {
      window.removeEventListener("blueprint:start-voice", on);
      window.removeEventListener("blueprint:intro-play", off);
      window.removeEventListener("blueprint:session-ended", off);
    };
  }, []);

  // Glow while she's actually speaking so the still portrait feels alive.
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const on = (e: Event) => setSpeaking(Boolean((e as CustomEvent<{ speaking?: boolean }>).detail?.speaking));
    window.addEventListener("isabel:speaking", on as EventListener);
    return () => window.removeEventListener("isabel:speaking", on as EventListener);
  }, []);

  const reduce = useReducedMotion();

  if (!desktop) return null;
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: 28, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 28, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="pointer-events-none fixed bottom-6 right-6 z-30 w-[300px]"
          aria-hidden="true"
        >
          <div
            className={`overflow-hidden rounded-3xl border bg-gradient-to-b from-[#141518] to-[#0b0b0c] transition-shadow duration-500 ${
              speaking
                ? "border-accent/50 shadow-[0_0_60px_rgba(56,189,248,0.35)]"
                : "border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
            }`}
          >
            <motion.img
              src="/images/isabel-hedra-source.jpg"
              alt=""
              className="h-[300px] w-full object-cover object-top"
              animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
              transition={reduce ? undefined : { duration: 16, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="flex items-center gap-2 px-4 py-3">
              <span className="relative flex h-2.5 w-2.5">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 ${
                    speaking ? "animate-ping opacity-70" : "opacity-0"
                  }`}
                />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <p className="text-sm font-semibold text-white">
                Isabel <span className="font-normal text-textMuted">· your guide</span>
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
