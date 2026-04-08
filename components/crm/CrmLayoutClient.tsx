"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CrmSidebar } from "./CrmSidebar";

const MIN_WIDTH = 160;
const MAX_WIDTH = 380;
const DEFAULT_WIDTH = 224; // w-56
const STORAGE_KEY = "crm_sidebar_width";

export function CrmLayoutClient({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH);
  const pathname = usePathname();

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile drawer when resizing to desktop
  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  // Restore sidebar width from localStorage
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
      try { localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging, width]);

  useEffect(() => {
    if (!dragging) {
      try { localStorage.setItem(STORAGE_KEY, String(width)); } catch {}
    }
  }, [dragging, width]);

  return (
    <div
      className="flex h-screen overflow-hidden bg-[#0B0B0C]"
      style={{ userSelect: dragging ? "none" : undefined }}
    >
      {/* ── Desktop sidebar ───────────────────────────────────────────── */}
      {!isMobile && <CrmSidebar width={width} />}

      {/* ── Mobile: backdrop ─────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile: slide-over drawer ─────────────────────────────────── */}
      <div
        className={[
          "fixed inset-y-0 left-0 z-50 transition-transform duration-300 ease-in-out",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {isMobile && (
          <CrmSidebar width={272} onClose={() => setMobileOpen(false)} />
        )}
      </div>

      {/* ── Desktop: resizable drag handle ───────────────────────────── */}
      {!isMobile && (
        <div
          onMouseDown={onMouseDown}
          style={{ left: width - 2 }}
          className={[
            "fixed top-0 h-full w-[5px] z-40 cursor-col-resize group transition-colors",
            dragging ? "bg-accent/60" : "bg-transparent hover:bg-accent/30",
          ].join(" ")}
          title="Drag to resize sidebar"
        >
          <div className={[
            "absolute inset-y-0 left-[2px] w-[1px] transition-colors",
            dragging ? "bg-accent/80" : "bg-white/[0.07] group-hover:bg-accent/50",
          ].join(" ")} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[3px] w-[3px] rounded-full bg-white/40" />
            ))}
          </div>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────── */}
      <main
        className="flex-1 h-screen overflow-y-auto min-w-0"
        style={{ marginLeft: isMobile ? 0 : width }}
      >
        {/* Mobile top bar */}
        {isMobile && (
          <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-[#111113]/95 backdrop-blur-sm border-b border-white/[0.07]">
            <button
              onClick={() => setMobileOpen(true)}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-textMuted hover:bg-white/[0.1] hover:text-textPrimary transition"
              aria-label="Open navigation"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-accent/20 text-accent text-[9px] font-bold tracking-tight">VS</div>
              <span className="text-sm font-semibold text-textPrimary truncate">VantageStack CRM</span>
            </div>
          </div>
        )}

        <div className="p-4 md:p-6 md:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
