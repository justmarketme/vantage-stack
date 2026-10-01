"use client";

import Link from "next/link";
import { Activity, TrendingUp } from "lucide-react";
import { useMe } from "../../../components/consultant/MeProvider";
import { PageHeader, Skeleton, SURFACE } from "../../../components/consultant/ui";
import { cx, FOCUS } from "../../../components/consultant/utils";
import { can, canAny, NoAccess } from "../../../components/consultant/wave2/parts";

/**
 * Admin hub. Each role sees only the views it can use (Norman): Systems &
 * Operations → health; Acquisition & Creative → growth; super admin → both.
 */
export default function AdminHubPage() {
  const { me } = useMe();
  if (!me) return <Skeleton className="h-[240px] rounded-2xl" />;

  const views = [
    can(me, "view_system_health") && {
      href: "/consultant/admin/systems",
      title: "Systems & Operations",
      body: "Platform health, n8n and EMMA deliveries, Emma messages, and dead letters to retry.",
      icon: Activity,
    },
    canAny(me, ["manage_gamification", "view_team_performance"]) && {
      href: "/consultant/admin/growth",
      title: "Acquisition & Creative Direction",
      body: "Pipeline velocity, the team funnel, gamification settings and rewards to hand out.",
      icon: TrendingUp,
    },
  ].filter(Boolean) as { href: string; title: string; body: string; icon: typeof Activity }[];

  return (
    <div className="space-y-5">
      <PageHeader title="Admin" />
      {views.length === 0 ? (
        <NoAccess what="the admin views" />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {views.map(({ href, title, body, icon: Icon }) => (
            <li key={href}>
              <Link href={href} className={cx(SURFACE, "flex min-h-[120px] items-start gap-3 p-5 hover:bg-[--cp-surface-2]", FOCUS)}>
                <Icon size={20} aria-hidden className="mt-0.5 shrink-0 text-[--cp-accent-text]" />
                <span>
                  <span className="block font-heading text-lg text-[--cp-text]">{title}</span>
                  <span className="mt-1 block text-sm text-[--cp-muted]">{body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
