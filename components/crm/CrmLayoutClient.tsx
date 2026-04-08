"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CrmSidebar } from "./CrmSidebar";

const MIN_WIDTH = 160;
const MAX_WIDTH = 380;
const DEFAULT_WIDTH = 224; // w-56
const STORAGE_KEY = "crm_sidebar_width";

export function CrmLayoutClient({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const n = Number(saved);
        if (n >= MIN_WIDTH && n <= MAX_WIDTH) setWidth(n);
      }
    } catch {}
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragStartX.current = e.clientX;
    dragStartWidth.current = width;
    setDragging(true);
  }, [width]);

  useEffect(() => {
    if (!dragging) return;

    function onMouseMove(e: MouseEvent) {
      const diff = e.clientX - dragStartX.current;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragStartWidth.current + diff));
      setWidth(newWidth);
    }

    function onMouseUp() {
      setDragging(false);
      try {
        localStorage.setItem(STORAGE_KEY, String(width));
      } catch {}
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, width]);

  // Persist width when dragging stops
  useEffect(() => {
    if (!dragging) {
      try { localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
    }
  }, [dragging, width]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B0B0C]" style={{ userSelect: dragging ? "none" : undefined }}>
      <CrmSidebar width={width} />

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        style={{ left: width - 2 }}
        className={[
          "fixed top-0 h-full w-[5px] z-40 cursor-col-resize group transition-colors",
          dragging ? "bg-accent/60" : "bg-transparent hover:bg-accent/30",
        ].join(" ")}
        title="Drag to resize sidebar"
      >
        {/* Visual indicator line */}
        <div className={[
          "absolute inset-y-0 left-[2px] w-[1px] transition-colors",
          dragging ? "bg-accent/80" : "bg-white/[0.07] group-hover:bg-accent/50",
        ].join(" ")} />
        {/* Drag grip dots in the middle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[3px] w-[3px] rounded-full bg-white/40" />
          ))}
        </div>
      </div>

      {/* Main content */}
      <main
        className="flex-1 h-screen overflow-y-auto"
        style={{ marginLeft: width }}
      >
        <div className="p-6 pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
