"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  Ellipsis,
  Inbox,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  Users,
  Zap,
} from "lucide-react";
import type { Session } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { useSession } from "@/components/clinic-crm/providers/SessionProvider";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { Skeleton } from "../ui/Skeleton";
import { ThemeToggle } from "./ThemeToggle";

export const BASE = "/clinic-crm";

export const canManage = (s: Session | null) => s?.role === "owner" || s?.role === "manager";

const NAV = [
  { href: "", label: "Today", Icon: LayoutDashboard },
  { href: "/inbox", label: "Inbox", Icon: Inbox },
  { href: "/patients", label: "Patients", Icon: Users },
  { href: "/appointments", label: "Appointments", short: "Diary", Icon: CalendarDays },
  { href: "/goals", label: "Goals", Icon: Target },
  { href: "/automations", label: "Automations", Icon: Zap },
  { href: "/settings", label: "Settings", Icon: Settings },
] as const;
const TAB_COUNT = 4; // the rest live behind "More" on mobile

const SIDEBAR_KEY = "cc:sidebar-collapsed";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === `${BASE}/login`) return <>{children}</>;
  return <AuthedShell pathname={pathname}>{children}</AuthedShell>;
}

function AuthedShell({ pathname, children }: { pathname: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  // SessionProvider owns auth: it redirects to login on any 401.
  const { session, signOut } = useSession();
  const dash = useQuery("dashboard", () => api.dashboard.get(), { persist: false, enabled: session !== null });
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  // Per-device preference only, so plain localStorage (guarded for private mode).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {}
  }, []);
  const toggleSidebar = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  useEffect(() => setMoreOpen(false), [pathname]);

  const unread = dash.data?.unreadConversations ?? 0;
  const isActive = (href: string) => (href === "" ? pathname === BASE : pathname.startsWith(BASE + href));
  const badgeFor = (href: string) => (href === "/inbox" && unread > 0 ? unread : 0);

  return (
    <>
      <a href="#cc-main" className="cc-skip">
        Skip to content
      </a>
      <div className="cc-shell">
        <aside className="cc-sidebar" data-collapsed={collapsed} aria-label="Primary">
          <div className="mb-6 flex items-center gap-3 px-1">
            <span className="cc-heading grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg,#3B82F6,#1D4ED8)" }} aria-hidden>
              VS
            </span>
            {!collapsed && (
              <div className="min-w-0">
                {session ? (
                  <p className="cc-heading truncate text-[15px] font-semibold">{session.clinicName}</p>
                ) : (
                  <Skeleton className="h-4 w-32" />
                )}
                <p className="cc-muted truncate text-xs">Vantage Stack Clinics</p>
              </div>
            )}
          </div>

          <nav className="flex flex-col gap-1">
            {NAV.map(({ href, label, Icon }) => {
              const badge = badgeFor(href);
              return (
                <Link
                  key={href}
                  href={BASE + href}
                  className="cc-nav-item"
                  aria-current={isActive(href) ? "page" : undefined}
                  title={collapsed ? label : undefined}
                >
                  <Icon size={20} aria-hidden className="shrink-0" />
                  <span className={collapsed ? "cc-sr-only" : undefined}>{label}</span>
                  {badge > 0 && (
                    <span className="cc-nav-dot cc-num" aria-label={`${badge} unread`}>
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto flex flex-col gap-3 pt-6">
            {collapsed ? <ThemeToggle compact /> : <ThemeToggle />}
            <div className="cc-divider flex items-center gap-2 pt-3">
              {!collapsed && (
                <div className="min-w-0 flex-1 px-1">
                  <p className="truncate text-sm font-medium">{session?.name ?? " "}</p>
                  <p className="cc-muted text-xs capitalize">{session?.role ?? " "}</p>
                </div>
              )}
              <Button variant="ghost" iconOnly aria-label="Sign out" onClick={signOut}>
                <LogOut size={18} aria-hidden />
              </Button>
            </div>
            <Button
              variant="ghost"
              iconOnly={collapsed}
              size="sm"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              icon={collapsed ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
              className={collapsed ? undefined : "justify-start"}
            >
              {!collapsed && <span className="cc-muted font-medium">Collapse</span>}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="cc-mobile-only flex items-center justify-between px-4 pt-4">
            <p className="cc-heading truncate text-[15px] font-semibold">{session?.clinicName ?? ""}</p>
            <ThemeToggle compact />
          </div>
          <motion.main
            id="cc-main"
            key={pathname}
            className="cc-main"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            {children}
          </motion.main>
        </div>
      </div>

      <nav className="cc-tabbar" aria-label="Primary">
        {NAV.slice(0, TAB_COUNT).map(({ href, label, Icon, ...rest }) => {
          const badge = badgeFor(href);
          return (
            <Link key={href} href={BASE + href} className="cc-tab" aria-current={isActive(href) ? "page" : undefined}>
              <Icon size={22} aria-hidden />
              {"short" in rest ? rest.short : label}
              {badge > 0 && (
                <span className="cc-nav-dot cc-num" aria-label={`${badge} unread`}>
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          className="cc-tab"
          aria-haspopup="dialog"
          aria-current={NAV.slice(TAB_COUNT).some((n) => isActive(n.href)) ? "page" : undefined}
          onClick={() => setMoreOpen(true)}
        >
          <Ellipsis size={22} aria-hidden />
          More
        </button>
      </nav>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} side="bottom" title="More">
        <nav className="flex flex-col gap-1" aria-label="More">
          {NAV.slice(TAB_COUNT).map(({ href, label, Icon }) => (
            <Link key={href} href={BASE + href} className="cc-nav-item" aria-current={isActive(href) ? "page" : undefined}>
              <Icon size={20} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="cc-divider mt-4 flex flex-wrap items-center justify-between gap-3 pt-4">
          <ThemeToggle showLabels />
          <Button variant="ghost" onClick={signOut} icon={<LogOut size={18} aria-hidden />}>
            Sign out
          </Button>
        </div>
      </Drawer>
    </>
  );
}
