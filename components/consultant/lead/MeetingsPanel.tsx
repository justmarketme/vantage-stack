"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarCheck, CalendarPlus, CalendarX } from "lucide-react";
import { formatSastDateTime } from "../../../lib/consultant/client/format";
import {
  CALENDAR_PROVIDERS,
  type CalendarProvider,
  type CalendarSyncState,
  type Lead,
  type Meeting,
  type MeetingKind,
  type MeetingStatus,
} from "../../../lib/consultant/types";
import { INPUT_CLASS } from "../MicField";
import { Sheet } from "../Sheet";
import { Button, EmptyState, SkeletonList, SURFACE } from "../ui";
import { cx, describeError } from "../utils";
import { useMeetings } from "../../../hooks/consultant/useMeetings";
import { invalidateQueries } from "../wave2/data";
import { Chip, LoadError, type ChipTone } from "../wave2/parts";
import { SastDateTimeField, sastDateKey, sastToIso, type SastParts } from "../wave2/SastDateTime";

const KIND_LABELS: Record<MeetingKind, string> = { discovery: "Discovery", demo: "Demo", follow_up: "Follow-up" };
const STATUS: Record<MeetingStatus, { label: string; tone: ChipTone }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  held: { label: "Held", tone: "progress" },
  no_show: { label: "No-show", tone: "risk" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
const PROVIDER_LABELS: Record<CalendarProvider, string> = { google: "Google", microsoft: "Outlook" };
const SYNC: Record<Exclude<CalendarSyncState, "not_connected">, { label: string; tone: ChipTone }> = {
  synced: { label: "synced", tone: "progress" },
  pending: { label: "syncing…", tone: "info" },
  failed: { label: "sync failed", tone: "risk" },
};

/**
 * Discovery / demo meetings for a lead: schedule (SAST), then mark held or
 * no-show. Stage automation (discovery booked, no-show, demo done) happens on
 * the server, so after any change we refetch the lead as well.
 */
export function MeetingsPanel({ lead, readOnly }: { lead: Lead; readOnly: boolean }) {
  const meetings = useMeetings({ leadId: lead.id });
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // useMeetings already refreshes meetings, the lead and lists; stage moves also change metrics.
  const refreshAll = () => void invalidateQueries("metrics:");

  const setStatus = async (m: Meeting, status: MeetingStatus) => {
    setBusyId(m.id);
    setActionError(null);
    try {
      const updated = await meetings.update(m.id, { status });
      meetings.mutate((prev) => (prev ?? []).map((x) => (x.id === m.id ? updated : x)));
      refreshAll();
    } catch (e) {
      setActionError(describeError(e, "save"));
    } finally {
      setBusyId(null);
    }
  };

  const sorted = [...(meetings.data ?? [])].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const now = Date.now();

  return (
    <section aria-labelledby="meetings-h">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="meetings-h" className="font-heading text-sm font-medium uppercase tracking-[0.14em] text-[--cp-muted]">
          Meetings
        </h2>
        {!readOnly && (
          <Button variant="secondary" onClick={() => setOpen(true)}>
            <CalendarPlus size={16} aria-hidden /> Schedule
          </Button>
        )}
      </div>

      <div aria-live="polite">
        {actionError && (
          <p role="alert" className="mb-2 text-sm text-[--cp-risk]">
            {actionError}
          </p>
        )}
      </div>

      {meetings.loading ? (
        <SkeletonList rows={2} rowClass="h-[92px]" />
      ) : meetings.error && !meetings.data ? (
        <LoadError error={meetings.error} onRetry={() => void meetings.refresh()} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No meetings yet"
          body={readOnly ? "Nothing booked with this clinic." : "Book the discovery or demo while you're on the call — a date on every call keeps the deal moving."}
        />
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => {
            const past = new Date(m.startsAt).getTime() <= now;
            const synced = CALENDAR_PROVIDERS.filter((p) => m.sync[p] !== "not_connected");
            return (
              <li key={m.id} className={cx(SURFACE, "p-3")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-[--cp-text]">{KIND_LABELS[m.kind]}</p>
                    <p className="text-sm text-[--cp-muted]">{formatSastDateTime(m.startsAt)}</p>
                  </div>
                  <Chip tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Chip>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {synced.length === 0 ? (
                    <Link href="/consultant/settings" className="inline-flex min-h-8 items-center text-xs text-[--cp-muted] underline-offset-2 hover:underline">
                      Not on a calendar — connect one in Settings
                    </Link>
                  ) : (
                    synced.map((p) => {
                      const st = SYNC[m.sync[p] as Exclude<CalendarSyncState, "not_connected">];
                      return (
                        <Chip key={p} tone={st.tone}>
                          {PROVIDER_LABELS[p]} {st.label}
                        </Chip>
                      );
                    })
                  )}
                </div>
                {m.notes && <p className="mt-2 text-sm text-[--cp-muted]">{m.notes}</p>}
                {!readOnly && m.status === "scheduled" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="progress" disabled={busyId === m.id || !past} onClick={() => void setStatus(m, "held")} title={past ? undefined : "Available once the meeting time has passed"}>
                      <CalendarCheck size={16} aria-hidden /> Held
                    </Button>
                    <Button variant="secondary" disabled={busyId === m.id || !past} onClick={() => void setStatus(m, "no_show")}>
                      <CalendarX size={16} aria-hidden /> No-show
                    </Button>
                    <Button variant="ghost" disabled={busyId === m.id} onClick={() => void setStatus(m, "cancelled")}>
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ScheduleSheet
        open={open}
        lead={lead}
        schedule={meetings.schedule}
        onClose={() => setOpen(false)}
        onDone={(m) => {
          meetings.mutate((prev) => [m, ...(prev ?? [])]);
          refreshAll();
          setOpen(false);
        }}
      />
    </section>
  );
}

function ScheduleSheet({
  open,
  lead,
  schedule,
  onClose,
  onDone,
}: {
  open: boolean;
  lead: Lead;
  schedule: ReturnType<typeof useMeetings>["schedule"];
  onClose: () => void;
  onDone: (m: Meeting) => void;
}) {
  const [kind, setKind] = useState<MeetingKind>(lead.salesStage === "new" || lead.salesStage === "contacted" ? "discovery" : "demo");
  const [when, setWhen] = useState<SastParts>({ date: sastDateKey(1), time: "10:00" });
  const [duration, setDuration] = useState(30);
  const [invite, setInvite] = useState(!!lead.email);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whenError, setWhenError] = useState<string | undefined>();

  const submit = async () => {
    const startsAt = sastToIso(when);
    if (!startsAt) return setWhenError("Pick a date and time.");
    if (new Date(startsAt).getTime() < Date.now()) return setWhenError("That time has already passed.");
    setWhenError(undefined);
    setSaving(true);
    setError(null);
    try {
      const m = await schedule({
        leadId: lead.id,
        kind,
        startsAt,
        durationMin: duration,
        inviteClinic: invite && !!lead.email,
        notes: notes.trim() || undefined,
      });
      onDone(m);
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      open={open}
      title="Schedule a meeting"
      onClose={onClose}
      footer={
        <div className="space-y-2">
          {error && (
            <p role="alert" className="text-sm text-[--cp-risk]">
              {error}
            </p>
          )}
          <Button variant="primary" size="lg" className="w-full" disabled={saving} onClick={() => void submit()}>
            {saving ? "Booking…" : `Book ${KIND_LABELS[kind].toLowerCase()}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-[--cp-text]">Type</legend>
          <div role="radiogroup" className="flex gap-2">
            {(["discovery", "demo", "follow_up"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={cx(
                  "min-h-11 flex-1 rounded-xl border px-3 text-sm",
                  kind === k ? "border-[--cp-accent] bg-[--cp-accent-soft] text-[--cp-text]" : "border-[--cp-border] bg-[--cp-surface] text-[--cp-muted]",
                )}
              >
                {KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </fieldset>
        <SastDateTimeField label="When" value={when} onChange={setWhen} minDate={sastDateKey(0)} error={whenError} />
        <div>
          <label htmlFor="mtg-dur" className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            Length
          </label>
          <select id="mtg-dur" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={cx(INPUT_CLASS, "border-[--cp-border]")}>
            {[15, 20, 30, 45, 60].map((d) => (
              <option key={d} value={d}>
                {d} minutes
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            checked={invite && !!lead.email}
            disabled={!lead.email}
            onChange={(e) => setInvite(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[--cp-accent]"
          />
          <span className="text-sm text-[--cp-text]">
            Send a calendar invite to the clinic
            <span className="block text-xs text-[--cp-muted]">{lead.email ? lead.email : "Add the clinic's email to send an invite."}</span>
          </span>
        </label>
        <div>
          <label htmlFor="mtg-notes" className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            Notes (optional)
          </label>
          <textarea
            id="mtg-notes"
            rows={2}
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={cx(INPUT_CLASS, "border-[--cp-border] py-2")}
          />
        </div>
      </div>
    </Sheet>
  );
}
