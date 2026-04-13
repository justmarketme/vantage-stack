"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { CrmSidebar } from "./CrmSidebar";

const MIN_WIDTH = 160;
const MAX_WIDTH = 380;
const DEFAULT_WIDTH = 224;
const STORAGE_KEY = "crm_sidebar_width";

const NAV_ITEMS = [
  {
    href: "/crm",
    label: "Dashboard",
    exact: true,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/crm/clients",
    label: "Contacts",
    exact: false,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
  },
  {
    href: "/crm/pipeline",
    label: "Pipeline",
    exact: false,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <rect x="3" y="3" width="4" height="18" rx="1" />
        <rect x="10" y="7" width="4" height="14" rx="1" />
        <rect x="17" y="10" width="4" height="11" rx="1" />
      </svg>
    ),
  },
  {
    href: "/crm/blueprint-review",
    label: "Blueprint",
    exact: false,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    href: "/crm/briefing",
    label: "Briefing",
    exact: false,
    icon: (
      <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
];

const PAGE_TITLES: Record<string, string> = {
  "/crm": "Dashboard",
  "/crm/clients": "Contacts",
  "/crm/pipeline": "Pipeline",
  "/crm/blueprint-review": "Blueprint",
  "/crm/briefing": "Briefing",
};

function getPageTitle(pathname: string): string {
  if (pathname === "/crm") return "Dashboard";
  for (const [key, title] of Object.entries(PAGE_TITLES)) {
    if (key !== "/crm" && pathname.startsWith(key)) return title;
  }
  return "CRM";
}

export function CrmLayoutClient({ children }: { children: React.ReactNode }) {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_WIDTH);
  const pathname = usePathname();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  const pageTitle = getPageTitle(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0B0B0C]" style={{ userSelect: dragging ? "none" : undefined }}>
      {!isMobile && <CrmSidebar width={width} />}

      {!isMobile && (
        <div
          onMouseDown={onMouseDown}
          style={{ left: width - 2 }}
          className={["fixed top-0 h-full w-[5px] z-40 cursor-col-resize group transition-colors", dragging ? "bg-accent/60" : "bg-transparent hover:bg-accent/30"].join(" ")}
          title="Drag to resize sidebar"
        >
          <div className={["absolute inset-y-0 left-[2px] w-[1px] transition-colors", dragging ? "bg-accent/80" : "bg-white/[0.07] group-hover:bg-accent/50"].join(" ")} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {[0,1,2,3,4].map((i) => <div key={i} className="h-[3px] w-[3px] rounded-full bg-white/40" />)}
          </div>
        </div>
      )}

      <main className="flex-1 h-screen overflow-y-auto min-w-0" style={{ marginLeft: isMobile ? 0 : width }}>
        {/* Mobile top bar — brand + page title, no hamburger */}
        {isMobile && (
          <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-[#111113]/95 backdrop-blur-sm border-b border-white/[0.07]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent text-[10px] font-bold tracking-tight">
                VS
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-medium text-textMuted">VantageStack</span>
                <span className="text-textMuted/30 text-sm">/</span>
                <span className="text-sm font-semibold text-textPrimary truncate">{pageTitle}</span>
              </div>
            </div>
          </div>
        )}

        <div className={["p-4 md:p-6 md:pt-8", isMobile ? "pb-[84px]" : ""].join(" ")}>
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation bar */}
      {isMobile && (
        <nav className="fixed bottom-0 inset-x-0 z-50 bg-[#111113]/95 backdrop-blur-md border-t border-white/[0.07]" style={{ height: 64 }}>
          <div className="flex items-stretch justify-around h-full">
            {NAV_ITEMS.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "relative flex flex-col items-center justify-center gap-[3px] flex-1 transition-all",
                    isActive ? "text-accent" : "text-textMuted",
                  ].join(" ")}
                >
                  {isActive && (
                    <span className="absolute top-0 inset-x-3 h-[2px] rounded-b-full bg-accent" />
                  )}
                  <span className={["transition-transform duration-150", isActive ? "scale-110" : ""].join(" ")}>
                    {item.icon}
                  </span>
                  <span
                    className="font-medium tracking-wide"
                    style={{ fontSize: 10 }}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
