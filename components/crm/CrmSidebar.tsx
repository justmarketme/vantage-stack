"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tooltip } from "../ui/Tooltip";

const nav = [
  {
    label: "Dashboard",
    href: "/crm",
    exact: true,
    tooltip: "Overview of your CRM — stats, activity feed, and quick actions",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    label: "Contacts",
    href: "/crm/clients",
    tooltip: "View, search, and manage all your contacts and clients",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: "Pipeline",
    href: "/crm/pipeline",
    tooltip: "Kanban board — move contacts through your sales stages",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="4" height="18" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="10" width="4" height="11" rx="1" />
      </svg>
    ),
  },
  {
    label: "Blueprint Review",
    href: "/crm/blueprint-review",
    tooltip: "Review intake submissions and generate strategy blueprints",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    label: "Morning Briefing",
    href: "/crm/briefing",
    tooltip: "Daily AI-generated intelligence: alerts, competitor moves, opportunities",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    label: "SEO Ops",
    href: "/crm/seo-ops",
    tooltip: "Live monitor of the SEO/marketing operation — agents, content pipeline, analytics",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    label: "VS Demo Caller",
    href: "/crm/demo-call",
    tooltip: "Live AI voice call demos — configure a client's agent and demo it on the spot",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.41 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6 6l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.73 16l.19.92z"/>
      </svg>
    ),
  },
  {
    label: "Lead Scraper",
    href: "/crm/lead-scraper",
    tooltip: "Scrape leads from Google Places and import them into Contacts",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
  },
  {
    label: "Add Contact",
    href: "/crm/clients/new",
    tooltip: "Add a new contact or client manually",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
        <line x1="12" y1="14" x2="12" y2="20" /><line x1="9" y1="17" x2="15" y2="17" />
      </svg>
    ),
  },
];

const COLLAPSED_WIDTH = 56;

export function CrmSidebar({
  width,
  onClose,
  collapsed,
  onToggleCollapse,
}: {
  width?: number;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();
  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : (width ?? 224);

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col bg-[#111113] border-r border-white/[0.07] z-30 transition-all duration-200"
      style={{ width: sidebarWidth }}
    >
      {/* Brand header */}
      <div className={["border-b border-white/[0.07] flex items-center gap-2.5", collapsed ? "px-3 py-4 justify-center" : "px-4 py-4 justify-between"].join(" ")}>
        {!collapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent text-[10px] font-bold">VS</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-textPrimary leading-none truncate">VantageStack</div>
              <div className="text-[10px] text-textMuted mt-0.5">CRM</div>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent text-[10px] font-bold">VS</div>
        )}
        {onClose && !collapsed && (
          <button onClick={onClose} className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-textMuted hover:bg-white/10 hover:text-textPrimary transition" aria-label="Close navigation">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className={["flex-1 py-4 space-y-0.5 overflow-hidden", collapsed ? "px-2" : "px-3"].join(" ")}>
        {nav.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Tooltip key={item.href} content={collapsed ? item.label : item.tooltip} side="right">
              <Link
                href={item.href}
                className={[
                  "flex items-center rounded-lg transition-all duration-150 w-full",
                  collapsed ? "justify-center p-3" : "gap-3 px-3 py-2.5",
                  active ? "bg-accent/15 text-accent" : "text-textMuted hover:bg-white/5 hover:text-textPrimary",
                ].join(" ")}
              >
                <span className={["shrink-0", active ? "text-accent" : "text-textMuted"].join(" ")}>{item.icon}</span>
                {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
              </Link>
            </Tooltip>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className={["border-t border-white/[0.07] py-3 space-y-0.5", collapsed ? "px-2" : "px-3"].join(" ")}>
        <Tooltip content="Return to the Admin Hub dashboard" side="right">
          <Link href="/admin" className={["flex items-center rounded-lg text-textMuted hover:bg-white/5 hover:text-textPrimary transition-all w-full", collapsed ? "justify-center p-3" : "gap-3 px-3 py-2.5"].join(" ")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {!collapsed && <span className="text-sm font-medium">Admin Hub</span>}
          </Link>
        </Tooltip>

        {/* Collapse toggle */}
        {onToggleCollapse && (
          <Tooltip content={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
            <button
              onClick={onToggleCollapse}
              className={["flex items-center rounded-lg text-textMuted hover:bg-white/5 hover:text-textPrimary transition-all w-full", collapsed ? "justify-center p-3" : "gap-3 px-3 py-2.5"].join(" ")}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {collapsed
                  ? <><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></>
                  : <><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></>
                }
              </svg>
              {!collapsed && <span className="text-sm font-medium">Collapse</span>}
            </button>
          </Tooltip>
        )}
      </div>
    </aside>
  );
}
