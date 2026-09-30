"use client";

import Link from "next/link";
import { memo } from "react";
import { House, Kanban, UserPlus } from "lucide-react";
import { cx, FOCUS } from "../utils";

const ITEMS = [
  { href: "/consultant", label: "Today", icon: House, exact: true },
  { href: "/consultant/pipeline", label: "Pipeline", icon: Kanban, exact: false },
  { href: "/consultant/leads/new", label: "New lead", icon: UserPlus, exact: true },
] as const;

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Phone/tablet: bottom tab bar in the thumb zone, above the home indicator. */
export const BottomTabs = memo(function BottomTabs({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Consultant portal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[--cp-border] bg-[--cp-bg] lg:hidden"
      style={{ paddingBottom: "var(--cp-safe-bottom)", paddingLeft: "var(--cp-safe-left)", paddingRight: "var(--cp-safe-right)" }}
    >
      <ul className="mx-auto grid h-16 max-w-md grid-cols-3">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-full flex-col items-center justify-center gap-1 text-xs font-medium",
                  FOCUS,
                  active ? "text-[--cp-accent-text]" : "text-[--cp-muted]",
                )}
              >
                <Icon size={22} aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});

/** ≥1024px: a narrow side rail. */
export const SideRail = memo(function SideRail({ pathname, userName }: { pathname: string; userName?: string }) {
  return (
    <nav
      aria-label="Consultant portal"
      className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center border-r border-[--cp-border] bg-[--cp-bg] py-5 lg:flex"
    >
      <Link
        href="/consultant"
        className={cx("mb-6 flex h-10 w-10 items-center justify-center rounded-xl bg-[--cp-accent-soft] font-heading text-xs font-semibold text-[--cp-accent-text]", FOCUS)}
        aria-label="VantageStack Consultant — Today"
      >
        VS
      </Link>
      <ul className="flex flex-1 flex-col gap-2">
        {ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-medium transition-colors",
                  FOCUS,
                  active ? "bg-[--cp-accent-soft] text-[--cp-accent-text]" : "text-[--cp-muted] hover:bg-[--cp-surface] hover:text-[--cp-text]",
                )}
              >
                <Icon size={22} aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      {userName && (
        <span
          title={userName}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[--cp-surface-2] text-xs font-semibold text-[--cp-text]"
        >
          {userName
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase()}
          <span className="sr-only">Signed in as {userName}</span>
        </span>
      )}
    </nav>
  );
});
