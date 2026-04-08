"use client";
import { useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export function Tooltip({ content, children, side = "right", delay = 250 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, transform: "" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const calcCoords = useCallback(() => {
    if (!wrapperRef.current) return null;
    const r = wrapperRef.current.getBoundingClientRect();
    const GAP = 10;
    switch (side) {
      case "right":
        return { top: r.top + r.height / 2, left: r.right + GAP, transform: "translateY(-50%)" };
      case "left":
        return { top: r.top + r.height / 2, left: r.left - GAP, transform: "translateY(-50%) translateX(-100%)" };
      case "top":
        return { top: r.top - GAP, left: r.left + r.width / 2, transform: "translateX(-50%) translateY(-100%)" };
      case "bottom":
        return { top: r.bottom + GAP, left: r.left + r.width / 2, transform: "translateX(-50%)" };
    }
  }, [side]);

  function show() {
    timer.current = setTimeout(() => {
      const c = calcCoords();
      if (c) setCoords(c);
      setVisible(true);
    }, delay);
  }

  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  }

  return (
    <div ref={wrapperRef} className="inline-flex w-full" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && content && typeof document !== "undefined" &&
        createPortal(
          <div
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: coords.transform,
              zIndex: 99999,
              pointerEvents: "none",
            }}
          >
            <div className="rounded-lg bg-[#1e1e2e] border border-white/20 px-3 py-2 text-xs text-white/95 shadow-2xl leading-snug max-w-[260px] whitespace-normal font-medium">
              {content}
            </div>
          </div>,
          document.body
        )
      }
    </div>
  );
}
