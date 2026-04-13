"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Tooltip } from "../../components/ui/Tooltip";

type Stats = {
  totalContacts: number;
  activeClients: number;
  blueprintsPending: number;
  pipelineValue: number;
  tasksDueToday: number;
  reportsThisMonth: number;
};

type RecentActivity = {
  id: string;
  action_type: string;
  client_name?: string;
  details: any;
  created_at: string;
};

function StatCard({
  label,
  value,
  sub,
  icon,
  accent,
  href,
  tooltip,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  href?: string;
  tooltip?: string;
}) {
  const inner = (
    <div className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#16161A] p-4 md:p-5 hover:border-white/[0.15] transition-all group ${href ? "cursor-pointer" : ""}`}>
      {/* Subtle gradient overlay for depth */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent" />
      <div className="relative flex items-start justify-between">
        <div className={`flex h-9 w-9 md:h-10 md:w-10 items-center justify-center rounded-lg ${accent}`}>
          {icon}
        </div>
        {href && (
          <svg className="h-4 w-4 text-textMuted group-hover:text-textPrimary transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </div>
      <div className="relative mt-3 md:mt-4">
        <div className="text-2xl md:text-2xl font-bold text-textPrimary tracking-tight">{value}</div>
        <div className="mt-0.5 text-xs md:text-sm font-medium text-textMuted">{label}</div>
        {sub && <div className="mt-1 text-[10px] md:text-xs text-textMuted/50">{sub}</div>}
      </div>
    </div>
  );
  const card = href ? <Link href={href}>{inner}</Link> : inner;
  return tooltip ? <Tooltip content={tooltip} side="bottom">{card}</Tooltip> : card;
}

function fmtMoney(n: number) {
  if (!n) return "R0";
  if (n >= 1000) return `R${(n / 1000).toFixed(1)}k`;
  return `R${n.toLocaleString()}`;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function activityLabel(a: RecentActivity) {
  const type = a.action_type ?? "";
  const name = a.client_name ?? a.details?.client_name ?? "Unknown";
  switch (type) {
    case "client_created": return `New contact added — ${name}`;
    case "report_sent": return `Report sent to ${name}`;
    case "proposal_sent": return `Proposal sent to ${name}`;
    case "blueprint_submitted": return `Blueprint submitted by ${name}`;
    case "note_added": return `Note added for ${name}`;
    case "status_changed": return `${name} moved to ${a.details?.new_status ?? "new stage"}`;
    default: return `${type.replace(/_/g, " ")} — ${name}`;
  }
}

function activityDot(type: string) {
  if (type.includes("blueprint")) return "bg-purple-400";
  if (type.includes("report") || type.includes("sent")) return "bg-blue-400";
  if (type.includes("created") || type.includes("added")) return "bg-emerald-400";
  if (type.includes("proposal")) return "bg-amber-400";
  return "bg-white/30";
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function CrmDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/crm/clients?per_page=1", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/crm/activity?limit=20", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/crm/pipeline", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/crm/clients?status=blueprint-submitted&per_page=1", { credentials: "same-origin" }).then((r) => r.json()).catch(() => ({})),
    ]).then(([clientsRes, activityRes, pipelineRes, blueprintRes]) => {
      const pipelineValue = (pipelineRes?.stages ?? []).reduce((sum: number, st: any) => {
        return sum + (st.clients ?? []).reduce((s: number, c: any) => s + (c.monthly_budget ?? 0), 0);
      }, 0);
      setStats({
        totalContacts: clientsRes?.total ?? 0,
        activeClients: (clientsRes?.clients ?? []).filter((c: any) => c.status === "active-client").length,
        blueprintsPending: blueprintRes?.total ?? 0,
        pipelineValue,
        tasksDueToday: 0,
        reportsThisMonth: 0,
      });
      setActivity(activityRes?.activity ?? []);
      setLoading(false);
    });
  }, []);

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const greeting = getGreeting();

  return (
    <div className="space-y-5 md:space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-textPrimary">
            {greeting} <span className="inline-block">👋</span>
          </h1>
          <p className="mt-0.5 text-sm text-textMuted truncate">{today}</p>
        </div>
        <Link
          href="/crm/clients/new"
          className="flex-shrink-0 flex items-center gap-2 rounded-lg bg-accent px-3 py-2 md:px-4 text-sm font-semibold text-white hover:bg-accent/90 transition"
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span className="hidden sm:inline">Add Contact</span>
          <span className="sm:hidden">Add</span>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatCard
          label="Total Contacts"
          value={loading ? "—" : stats?.totalContacts ?? 0}
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
          }
          accent="bg-blue-500/15 text-blue-400"
          href="/crm/clients"
          tooltip="Total number of contacts across all pipeline stages. Click to view all contacts."
        />
        <StatCard
          label="Pipeline Value"
          value={loading ? "—" : fmtMoney(stats?.pipelineValue ?? 0)}
          sub="monthly recurring"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
            </svg>
          }
          accent="bg-emerald-500/15 text-emerald-400"
          href="/crm/pipeline"
          tooltip="Combined monthly budget/value of all contacts in your pipeline."
        />
        <StatCard
          label="Blueprints Pending"
          value={loading ? "—" : stats?.blueprintsPending ?? 0}
          sub="awaiting review"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          }
          accent="bg-purple-500/15 text-purple-400"
          href="/crm/blueprint-review"
          tooltip="Contacts who have submitted the intake form and are waiting for their blueprint."
        />
        <StatCard
          label="Pipeline Stages"
          value="5"
          sub="active stages"
          icon={
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="3" y="3" width="4" height="18" rx="1" /><rect x="10" y="7" width="4" height="14" rx="1" /><rect x="17" y="10" width="4" height="11" rx="1" />
            </svg>
          }
          accent="bg-amber-500/15 text-amber-400"
          href="/crm/pipeline"
          tooltip="Your 5 active pipeline stages. Click to view the Kanban board."
        />
      </div>

      {/* Main content:
          Mobile: Activity Feed first (full width), then Quick Actions hidden
          Desktop: Quick Actions sidebar + Activity Feed (lg:grid-cols-3) */}

      {/* Activity Feed — full width on mobile, 2/3 on desktop */}
      <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5 lg:hidden">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-textPrimary">Recent Activity</h2>
          <span className="text-xs text-textMuted">Last 20 events</span>
        </div>
        <ActivityFeedContent loading={loading} activity={activity} />
      </div>

      {/* Desktop layout: Quick Actions + Activity Feed side by side */}
      <div className="hidden lg:grid gap-6 lg:grid-cols-3">
        {/* Quick Actions + Pipeline Stages */}
        <div className="lg:col-span-1 space-y-4">
          <QuickActionsPanel />
          <PipelineStagesPanel />
        </div>

        {/* Activity Feed */}
        <div className="lg:col-span-2 rounded-xl border border-white/[0.08] bg-[#16161A] p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-textPrimary">Recent Activity</h2>
            <span className="text-xs text-textMuted">Last 20 events</span>
          </div>
          <ActivityFeedContent loading={loading} activity={activity} />
        </div>
      </div>
    </div>
  );
}

function ActivityFeedContent({ loading, activity }: { loading: boolean; activity: RecentActivity[] }) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-textMuted">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/10 border-t-accent" />
        Loading activity…
      </div>
    );
  }

  if (activity.length === 0) {
    return (
      <div className="py-12 text-center">
        <div className="text-3xl mb-2">📭</div>
        <p className="text-sm text-textMuted">No activity yet. Add your first contact to get started.</p>
        <Link href="/crm/clients/new" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 transition">
          Add Contact
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activity.map((a) => (
        <div key={a.id} className="flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-white/[0.03] transition-colors group">
          <div className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${activityDot(a.action_type)}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-textPrimary leading-snug">{activityLabel(a)}</p>
            {a.details?.note && (
              <p className="text-xs text-textMuted mt-0.5 truncate">{a.details.note}</p>
            )}
          </div>
          <span className="text-xs text-textMuted/60 flex-shrink-0 mt-0.5">{timeAgo(a.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

function QuickActionsPanel() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5">
      <h2 className="text-sm font-semibold text-textPrimary mb-4">Quick Actions</h2>
      <div className="space-y-2">
        {[
          { label: "View Pipeline Board", href: "/crm/pipeline", icon: "📊", tooltip: "See all contacts in a visual Kanban board sorted by stage" },
          { label: "Review Blueprints", href: "/crm/blueprint-review", icon: "📋", tooltip: "Review and generate strategy blueprints for pending submissions" },
          { label: "Morning Briefing", href: "/crm/briefing", icon: "☀️", tooltip: "Read today's AI-generated daily intelligence briefing" },
          { label: "Add New Contact", href: "/crm/clients/new", icon: "➕", tooltip: "Manually add a new contact to your CRM" },
          { label: "All Contacts", href: "/crm/clients", icon: "👥", tooltip: "Browse and filter all your CRM contacts" },
        ].map((a) => (
          <Tooltip key={a.href} content={a.tooltip} side="right">
            <Link
              href={a.href}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-textMuted hover:bg-white/5 hover:text-textPrimary transition-all w-full"
            >
              <span className="text-base">{a.icon}</span>
              {a.label}
            </Link>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

function PipelineStagesPanel() {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#16161A] p-5">
      <h2 className="text-sm font-semibold text-textPrimary mb-3">Pipeline Stages</h2>
      <div className="space-y-2">
        {[
          { label: "Blueprint Submitted", color: "bg-purple-400", status: "blueprint-submitted", tooltip: "Click to view all contacts in this stage" },
          { label: "Report Sent", color: "bg-blue-400", status: "report-sent", tooltip: "Click to view all contacts in this stage" },
          { label: "Proposal Sent", color: "bg-amber-400", status: "proposal-sent", tooltip: "Click to view all contacts in this stage" },
          { label: "Active Client", color: "bg-emerald-400", status: "active-client", tooltip: "Click to view all active paying clients" },
          { label: "Upsell", color: "bg-pink-400", status: "upsell-sent", tooltip: "Click to view upsell opportunity contacts" },
        ].map((s) => (
          <Tooltip key={s.status} content={s.tooltip} side="right">
            <Link
              href={`/crm/clients?status=${s.status}`}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-textMuted hover:bg-white/5 hover:text-textPrimary transition-all w-full group"
            >
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${s.color} flex-shrink-0`} />
                {s.label}
              </div>
              <svg className="h-3 w-3 opacity-0 group-hover:opacity-50 transition" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
