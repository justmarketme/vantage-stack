"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { motion, useDragControls, useReducedMotion } from "framer-motion";
import { GripHorizontal, Minus, PhoneCall } from "lucide-react";
import { useCall, useCoach } from "../VoiceCallProvider";
import { CallTimer } from "../call/CallTimer";
import { CallStatusLabel } from "../call/CallStatus";
import { buttonClass } from "../ui";
import { cx, FOCUS } from "../utils";
import { CoachAvatar } from "./CoachAvatar";
import { CoachPanel } from "./CoachPanel";

/**
 * Desktop floating Coach Alex: layered over any portal page while a call is
 * live (e.g. checking the pipeline mid-call). Drag by the grip; minimise to a
 * pill. Lives in the layout, so it keeps its position across navigation.
 */
export function CoachFloat() {
  const voice = useCall();
  const { active, queue } = useCoach();
  const reduce = useReducedMotion();
  const bounds = useRef<HTMLDivElement>(null);
  const controls = useDragControls();
  const [minimised, setMinimised] = useState(false);

  if (!voice.call || (!voice.live && !voice.needsWrapUp)) return null;
  const ended = !voice.live;
  const callHref = `/consultant/call/${voice.call.id}`;

  return (
    <div ref={bounds} className="pointer-events-none fixed inset-4 z-40 hidden lg:block">
      <motion.div
        drag={!reduce}
        dragListener={false}
        dragControls={controls}
        dragConstraints={bounds}
        dragMomentum={false}
        dragElastic={0}
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: 32 }}
        animate={{ opacity: 1, x: 0 }}
        className="pointer-events-auto absolute bottom-0 right-0"
      >
        {minimised ? (
          <button
            type="button"
            onClick={() => setMinimised(false)}
            className={cx(
              "flex min-h-12 items-center gap-2 rounded-full border border-[--cp-border-strong] bg-[--cp-surface] py-1.5 pl-1.5 pr-4 shadow-[0_12px_32px_rgba(0,0,0,0.5)]",
              active && `cp-edge-${active.severity}`,
              FOCUS,
            )}
            aria-label={active ? `Open Coach Alex — new card: ${active.title}` : "Open Coach Alex"}
          >
            <CoachAvatar pulseKey={active?.id ?? null} severity={active?.severity ?? null} size={36} />
            <span className="text-sm text-[--cp-text]">Coach Alex</span>
            {(active || queue.length > 0) && (
              <span className="rounded-full bg-[--cp-coach-soft] px-2 text-xs font-semibold text-[--cp-coach]">
                {(active ? 1 : 0) + queue.length}
              </span>
            )}
          </button>
        ) : (
          <div className="flex h-[min(600px,72vh)] w-[380px] flex-col rounded-3xl border border-[--cp-border-strong] bg-[--cp-bg] p-3 shadow-[0_20px_48px_rgba(0,0,0,0.55)]">
            <div
              onPointerDown={(e) => controls.start(e)}
              className="mb-2 flex cursor-grab touch-none items-center gap-2 rounded-xl bg-[--cp-surface] px-3 py-2 active:cursor-grabbing"
            >
              <GripHorizontal size={16} className="text-[--cp-muted]" aria-hidden />
              <CallStatusLabel state={voice.state} reconnecting={voice.reconnecting} className="text-xs" />
              {!ended && <CallTimer className="text-xs text-[--cp-muted]" />}
              <Link href={callHref} className={cx(buttonClass("secondary", "md", "ml-auto min-h-9 px-3 text-xs"))}>
                <PhoneCall size={14} aria-hidden /> {ended ? "Wrap up" : "Open call"}
              </Link>
              <button
                type="button"
                onClick={() => setMinimised(true)}
                className={cx("inline-flex h-9 w-9 items-center justify-center rounded-lg text-[--cp-muted] hover:text-[--cp-text]", FOCUS)}
                aria-label="Minimise Coach Alex"
              >
                <Minus size={16} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <CoachPanel compact />
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
