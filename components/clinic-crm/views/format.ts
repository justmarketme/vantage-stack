import type { AppointmentStatus, AutomationKind, GoalMetric, LeadStage } from "@/lib/clinic-crm/types";
import type { Tone } from "../ui/Badge";

const LOCALE = "en-ZA";

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });

export const fmtDay = (d: Date | string) =>
  new Date(d).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });

export const fmtLongDay = (d: Date) =>
  d.toLocaleDateString(LOCALE, { weekday: "long", day: "numeric", month: "long" });

/** Inbox-style stamp: time today, "Yesterday", else a short date. */
export function fmtStamp(iso: string): string {
  const d = new Date(iso);
  const today = startOfDay(new Date());
  if (d >= today) return fmtTime(iso);
  if (d >= addDays(today, -1)) return "Yesterday";
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday-start week. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  return addDays(x, -((x.getDay() + 6) % 7));
}

/** Local YYYY-MM-DD for <input type="date">. */
export function toDateInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export const STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  booked: { label: "Booked", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "accent" },
  attended: { label: "Attended", tone: "success" },
  no_show: { label: "No-show", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const LEAD: Record<LeadStage, { label: string; tone: Tone }> = {
  new: { label: "New lead", tone: "accent" },
  contacted: { label: "Contacted", tone: "warning" },
  booked: { label: "Booked", tone: "success" },
  lost: { label: "Lost", tone: "neutral" },
};

export const METRIC: Record<GoalMetric, { label: string; unit: string; lowerIsBetter: boolean }> = {
  no_show_rate: { label: "No-show rate", unit: "%", lowerIsBetter: true },
  speed_to_lead_min: { label: "Speed to lead", unit: "min", lowerIsBetter: true },
  bookings: { label: "Bookings", unit: "", lowerIsBetter: false },
  revenue: { label: "Revenue", unit: "R", lowerIsBetter: false },
  custom: { label: "Custom", unit: "", lowerIsBetter: false },
};

export const AUTOMATION_ORDER: readonly AutomationKind[] = [
  "new_lead_ack",
  "appointment_reminder",
  "no_show_followup",
  "recall",
];
