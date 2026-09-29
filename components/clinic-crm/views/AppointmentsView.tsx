"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Appointment } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useContinuity } from "@/lib/clinic-crm/client/continuity";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { AppointmentDrawer, NewAppointmentDrawer } from "./AppointmentDrawers";
import { PageHeader } from "./PageHeader";
import { errorMessage } from "./errors";
import { STATUS, addDays, fmtDay, fmtLongDay, fmtTime, startOfDay, startOfWeek, toDateInput } from "./format";

type Span = "day" | "week";

export function AppointmentsView() {
  const [filter, setFilter] = useContinuity<{ span: Span }>("filter:appointments", { span: "day" });
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [creating, setCreating] = useState(false);
  const [openAppt, setOpenAppt] = useState<Appointment | null>(null);

  const week = filter.span === "week";
  const from = week ? startOfWeek(anchor) : anchor;
  const days = week ? 7 : 1;
  const to = addDays(from, days);
  const list = useQuery(
    `appts:${from.toISOString()}:${to.toISOString()}`,
    () => api.appointments.list(from.toISOString(), to.toISOString()),
    { persist: false },
  );

  const byDay = Array.from({ length: days }, (_, i) => {
    const day = addDays(from, i);
    const key = toDateInput(day);
    return {
      day,
      items: (list.data ?? [])
        .filter((a) => toDateInput(new Date(a.startsAt)) === key)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    };
  });
  const total = list.data?.length ?? 0;
  const rangeLabel = week ? `${fmtDay(from)} – ${fmtDay(addDays(to, -1))}` : fmtLongDay(anchor);
  const isToday = toDateInput(anchor) === toDateInput(new Date());

  const changed = () => {
    setOpenAppt(null);
    list.refresh();
  };

  return (
    <div className="cc-page">
      <PageHeader
        title="Appointments"
        subtitle={rangeLabel}
        actions={
          <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setCreating(true)}>
            New appointment
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" iconOnly aria-label={week ? "Previous week" : "Previous day"} onClick={() => setAnchor(addDays(anchor, -days))}>
            <ChevronLeft size={20} aria-hidden />
          </Button>
          <Button variant="secondary" size="sm" disabled={isToday && !week} onClick={() => setAnchor(startOfDay(new Date()))}>
            Today
          </Button>
          <Button variant="ghost" iconOnly aria-label={week ? "Next week" : "Next day"} onClick={() => setAnchor(addDays(anchor, days))}>
            <ChevronRight size={20} aria-hidden />
          </Button>
        </div>
        <Segmented<Span>
          label="Range"
          value={filter.span}
          onChange={(span) => setFilter({ span })}
          options={[
            { value: "day", label: "Day" },
            { value: "week", label: "Week" },
          ]}
        />
      </div>

      {list.error && !list.data && (
        <p className="cc-notice mb-4" data-tone="danger" role="alert">
          {errorMessage(list.error, "Couldn't load appointments.")}
        </p>
      )}

      {list.loading && !list.data ? (
        <div className="cc-card flex flex-col gap-3 p-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : total === 0 && !list.error ? (
        <div className="cc-card">
          <EmptyState
            icon={<CalendarDays size={26} />}
            title={week ? "Nothing booked this week" : "Nothing booked"}
            action={
              <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setCreating(true)}>
                Book an appointment
              </Button>
            }
          >
            Book a patient in and they’ll get a reminder automatically — no-shows get a follow-up.
          </EmptyState>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {byDay.map(({ day, items }) =>
            week && items.length === 0 ? null : (
              <section key={day.toISOString()} className="cc-card overflow-hidden" aria-label={fmtLongDay(day)}>
                {week && (
                  <h2 className="cc-muted px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider md:px-5">{fmtLongDay(day)}</h2>
                )}
                <ul role="list">
                  {items.map((a, i) => (
                    <li key={a.id} className={i ? "cc-divider" : undefined}>
                      <button
                        type="button"
                        onClick={() => setOpenAppt(a)}
                        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-[color:var(--cc-surface-2)] md:px-5"
                      >
                        <span className="cc-num w-12 shrink-0 font-semibold">{fmtTime(a.startsAt)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{a.patientName}</span>
                          <span className="cc-muted block truncate text-sm">
                            {a.durationMin} min{a.service && ` · ${a.service}`}
                            {a.practitioner && ` · ${a.practitioner}`}
                          </span>
                        </span>
                        <Badge tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Badge>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}

      <NewAppointmentDrawer
        key={toDateInput(from)}
        open={creating}
        onClose={() => setCreating(false)}
        defaultDate={week && isToday ? new Date() : from}
        onCreated={() => {
          setCreating(false);
          list.refresh();
        }}
      />
      <AppointmentDrawer appt={openAppt} onClose={() => setOpenAppt(null)} onChanged={changed} />
    </div>
  );
}
