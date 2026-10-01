"use client";

import Link from "next/link";
import { memo, useEffect, useState } from "react";
import {
  Clapperboard,
  Ellipsis,
  GaugeCircle,
  GraduationCap,
  House,
  Kanban,
  Settings,
  ShieldCheck,
  Target,
  Trophy,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { Me } from "../../../lib/consultant/types";
import { Sheet } from "../Sheet";
import { canAny } from "../wave2/parts";
import { cx, FOCUS } from "../utils";

type Item = { href: string; label: string; icon: LucideIcon; exact: boolean };

/*
 * Navigation (Norman: progressive disclosure). Phones keep the four most-used
 * destinations in the thumb zone — Today, Pipeline, Leaderboard, More — and the
 * rest live in the "More" sheet. Desktop shows everything on the side rail.
 * Admin only appears for roles that can use at least one admin view.
 */

const TODAY: Item = { href: "/consultant", label: "Today", icon: House, exact: true };
const PIPELINE: Item = { href: "/consultant/pipeline", label: "Pipeline", icon: Kanban, exact: false };
const LEADERBOARD: Item = { href: "/consultant/leaderboard", label: "Leaderboard", icon: Trophy, exact: false };
const NEW_LEAD: Item = { href: "/consultant/leads/new", label: "New lead", icon: UserPlus, exact: true };
const WHY: Item = { href: "/consultant/why", label: "Why Board", icon: Target, exact: false };
const PERFORMANCE: Item = { href: "/consultant/performance", label: "Performance", icon: GaugeCircle, exact: false };
const TRAINING: Item = { href: "/consultant/training", label: "Training", icon: GraduationCap, exact: false };
const DEMO: Item = { href: "/consultant/demo", label: "Demo", icon: Clapperboard, exact: false };
const SETTINGS: Item = { href: "/consultant/settings", label: "Settings", icon: Settings, exact: false };
const ADMIN: Item = { href: "/consultant/admin", label: "Admin", icon: ShieldCheck, exact: false };

function showAdmin(me: Me | undefined): boolean {
  return canAny(me, ["view_system_health", "manage_gamification", "view_team_performance"]);
}

/** Everything that isn't a primary phone tab, in the order it appears in "More". */
function moreItems(me: Me | undefined): Item[] {
  return [WHY, PERFORMANCE, TRAINING, DEMO, NEW_LEAD, SETTINGS, ...(showAdmin(me) ? [ADMIN] : [])];
}

function railItems(me: Me | undefined): Item[] {
  return [TODAY, PIPELINE, NEW_LEAD, WHY, PERFORMANCE, LEADERBOARD, TRAINING, DEMO, SETTINGS, ...(showAdmin(me) ? [ADMIN] : [])];
}

function isActive(pathname: string, href: string, exact: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

/** Phone/tablet: bottom tab bar in the thumb zone, above the home indicator. */
export const BottomTabs = memo(function BottomTabs({ pathname, me }: { pathname: string; me?: Me }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const more = moreItems(me);
  const moreActive = more.some((i) => isActive(pathname, i.href, i.exact));

  // Close the sheet whenever the route changes (a link inside it was followed).
  useEffect(() => setMoreOpen(false), [pathname]);

  const tab = "flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-medium";
  return (
    <>
      <nav
        aria-label="Consultant portal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[--cp-border] bg-[--cp-bg] lg:hidden"
        style={{ paddingBottom: "var(--cp-safe-bottom)", paddingLeft: "var(--cp-safe-left)", paddingRight: "var(--cp-safe-right)" }}
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-4">
          {[TODAY, PIPELINE, LEADERBOARD].map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cx(tab, FOCUS, active ? "text-[--cp-accent-text]" : "text-[--cp-muted]")}
                >
                  <Icon size={22} aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen(true)}
              className={cx(tab, FOCUS, moreActive ? "text-[--cp-accent-text]" : "text-[--cp-muted]")}
            >
              <Ellipsis size={22} aria-hidden strokeWidth={moreActive ? 2.25 : 1.75} />
              More
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {more.map(({ href, label, icon: Icon, exact }) => {
            const active = isActive(pathname, href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMoreOpen(false)}
                  className={cx(
                    "flex min-h-16 items-center gap-3 rounded-2xl border border-[--cp-border] px-4 text-sm font-medium",
                    FOCUS,
                    active ? "bg-[--cp-accent-soft] text-[--cp-accent-text]" : "bg-[--cp-surface-2] text-[--cp-text]",
                  )}
                >
                  <Icon size={20} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
});

/** ≥1024px: a narrow side rail with every destination. */
export const SideRail = memo(function SideRail({ pathname, userName, me }: { pathname: string; userName?: string; me?: Me }) {
  const items = railItems(me);
  return (
    <nav
      aria-label="Consultant portal"
      className="fixed inset-y-0 left-0 z-30 hidden w-[88px] flex-col items-center border-r border-[--cp-border] bg-[--cp-bg] py-5 lg:flex"
    >
      <Link
        href="/consultant"
        className={cx("mb-4 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[--cp-accent-soft] font-heading text-xs font-semibold text-[--cp-accent-text]", FOCUS)}
        aria-label="VantageStack Consultant — Today"
      >
        VS
      </Link>
      <ul className="cp-scroll-y flex min-h-0 flex-1 flex-col gap-1.5 px-1">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-16 w-[72px] flex-col items-center justify-center gap-1 rounded-2xl text-center text-[11px] font-medium leading-tight transition-colors",
                  FOCUS,
                  active ? "bg-[--cp-accent-soft] text-[--cp-accent-text]" : "text-[--cp-muted] hover:bg-[--cp-surface] hover:text-[--cp-text]",
                )}
              >
                <Icon size={20} aria-hidden strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      {userName && (
        <span
          title={userName}
          className="mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[--cp-surface-2] text-xs font-semibold text-[--cp-text]"
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
