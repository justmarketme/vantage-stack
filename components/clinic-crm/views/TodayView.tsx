"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, Clock, Inbox, Timer, UserCheck, UserX, Bell, Users } from "lucide-react";
import type { Appointment, AppointmentStatus } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Skeleton } from "../ui/Skeleton";
import { StatTile } from "../ui/StatTile";
import { useSession } from "@/components/clinic-crm/providers/SessionProvider";
import { useToast } from "@/components/clinic-crm/providers/ToastProvider";
import { BASE } from "./AppShell";
import { PageHeader } from "./PageHeader";
import { errorMessage } from "./errors";
import { STATUS, fmtLongDay, fmtTime } from "./format";

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function TodayView() {
  const { session } = useSession();
  const dash = useQuery("dashboard", () => api.dashboard.get(), { persist: false });
  const d = dash.data;
  const now = new Date();
  const loading = dash.loading && !d;

  return (
    <div className="cc-page">
      <PageHeader
        title={`${greeting(now)}${session ? `, ${session.name.split(" ")[0]}` : ""}`}
        subtitle={fmtLongDay(now)}
        actions={
          <Link href={`${BASE}/appointments`} className="cc-btn cc-btn-primary">
            <CalendarDays size={18} aria-hidden /> Book appointment
          </Link>
        }
      />

      {dash.error && !d && (
        <p className="cc-notice mb-6" data-tone="danger" role="alert">
          {errorMessage(dash.error, "Couldn't load today's numbers.")}{" "}
          <button type="button" className="underline" onClick={() => dash.refresh()}>
            Retry
          </button>
        </p>
      )}

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatTile
          label="Speed to lead"
          icon={<Timer size={18} />}
          loading={loading}
          value={d?.speedToLeadMin == null ? "—" : d.speedToLeadMin < 1 ? "<1" : Math.round(d.speedToLeadMin)}
          unit={d?.speedToLeadMin == null ? undefined : "min"}
          hint="Median first reply, 30 days"
        />
        <StatTile
          label="No-show rate"
          icon={<UserX size={18} />}
          loading={loading}
          value={d?.noShowRate == null ? "—" : Math.round(d.noShowRate * 100)}
          unit={d?.noShowRate == null ? undefined : "%"}
          hint="Last 30 days"
        />
        <StatTile
          label="Reminders sent"
          icon={<Bell size={18} />}
          loading={loading}
          value={d?.remindersSent30d ?? 0}
          hint="Last 30 days"
        />
        <StatTile
          label="Open leads"
          icon={<Users size={18} />}
          loading={loading}
          value={d?.openLeads ?? 0}
          hint={
            <Link href={`${BASE}/patients`} className="cc-accent font-medium hover:underline">
              Enquiries not yet booked →
            </Link>
          }
        />
      </section>

      <div className="mt-6 grid gap-4 md:mt-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card padded={false} className="p-4 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Today’s appointments</h2>
            {d && <span className="cc-muted cc-num text-sm">{d.today.length} booked</span>}
          </div>
          {loading ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : d && d.today.length > 0 ? (
            <Timeline appointments={d.today} onChanged={() => dash.refresh()} />
          ) : (
            <EmptyState
              icon={<CalendarDays size={26} />}
              title="A clear day"
              action={
                <Link href={`${BASE}/appointments`} className="cc-btn cc-btn-secondary">
                  Book an appointment
                </Link>
              }
            >
              Appointments you book appear here, and patients get a WhatsApp reminder automatically.
            </EmptyState>
          )}
        </Card>

        <Card className="flex flex-col gap-4 self-start">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl cc-surface-2 cc-accent" aria-hidden>
              <Inbox size={20} />
            </span>
            <div>
              <h2 className="text-lg font-semibold leading-tight">Inbox</h2>
              <p className="cc-muted text-sm">
                {loading ? "…" : d?.unreadConversations ? `${d.unreadConversations} waiting for a reply` : "All caught up"}
              </p>
            </div>
          </div>
          <Link href={`${BASE}/inbox`} className="cc-btn cc-btn-secondary w-full">
            Open inbox
          </Link>
        </Card>
      </div>
    </div>
  );
}

function Timeline({ appointments, onChanged }: { appointments: Appointment[]; onChanged: () => void }) {
  const { show: toast } = useToast();
  // Optimistic status per appointment so a tap feels instant.
  const [local, setLocal] = useState<Record<string, AppointmentStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const sorted = [...appointments].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const now = Date.now();
  const nextId = sorted.find((a) => new Date(a.startsAt).getTime() + a.durationMin * 60_000 > now)?.id;

  const mark = async (a: Appointment, status: AppointmentStatus) => {
    setLocal((m) => ({ ...m, [a.id]: status }));
    setBusy(a.id);
    try {
      await api.appointments.update(a.id, { status });
      toast(status === "no_show" ? "Marked as no-show — follow-up scheduled" : "Marked as attended", "success");
      onChanged();
    } catch (e) {
      setLocal(({ [a.id]: _, ...rest }) => rest);
      toast(errorMessage(e, "Couldn't update the appointment."), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ol className="cc-timeline flex flex-col gap-2">
      {sorted.map((a) => {
        const status = local[a.id] ?? a.status;
        const meta = STATUS[status];
        const open = status === "booked" || status === "confirmed";
        const tone = status === "attended" ? "success" : status === "no_show" ? "danger" : a.id === nextId ? "accent" : undefined;
        return (
          <li key={a.id} className="relative flex gap-4">
            <span className="cc-num w-[44px] shrink-0 pt-4 text-right text-sm font-semibold">{fmtTime(a.startsAt)}</span>
            <span className="cc-timeline-dot" data-tone={tone} aria-hidden />
            <div
              className="ml-4 flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-3 py-3"
              style={a.id === nextId ? { background: "var(--cc-accent-soft)" } : undefined}
            >
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate font-semibold">{a.patientName}</p>
                <p className="cc-muted flex items-center gap-1.5 truncate text-sm">
                  <Clock size={13} aria-hidden /> {a.durationMin} min
                  {a.service && ` · ${a.service}`}
                  {a.practitioner && ` · ${a.practitioner}`}
                </p>
              </div>
              {open ? (
                <div className="flex gap-2" role="group" aria-label={`Mark ${a.patientName}`}>
                  <Button size="sm" variant="secondary" disabled={busy === a.id} onClick={() => mark(a, "attended")} icon={<UserCheck size={16} aria-hidden />}>
                    Attended
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => mark(a, "no_show")} icon={<UserX size={16} aria-hidden />}>
                    No-show
                  </Button>
                </div>
              ) : (
                <Badge tone={meta.tone}>{meta.label}</Badge>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
