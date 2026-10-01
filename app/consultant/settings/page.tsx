"use client";

import { useState } from "react";
import { CalendarDays, Headphones, Volume2 } from "lucide-react";
import { useCalendarConnections } from "../../../hooks/consultant/useCalendarConnections";
import { useCoachAudio } from "../../../hooks/consultant/useCoachAudio";
import { formatSastDate } from "../../../lib/consultant/client/format";
import { CALENDAR_PROVIDERS, type CalendarConnection, type CalendarProvider } from "../../../lib/consultant/types";
import { useMe } from "../../../components/consultant/MeProvider";
import { Button, buttonClass, PageHeader, SectionTitle, SkeletonList, SURFACE } from "../../../components/consultant/ui";
import { cx, describeError, FOCUS } from "../../../components/consultant/utils";
import { Chip, LoadError } from "../../../components/consultant/wave2/parts";

const PROVIDER_LABELS: Record<CalendarProvider, string> = { google: "Google Calendar", microsoft: "Outlook / Microsoft 365" };

/**
 * Settings (Norman: the complex stuff lives here, out of the selling flow):
 * calendar connections and Coach Alex audio cues.
 */
export default function SettingsPage() {
  const { me } = useMe();
  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <PageHeader title="Settings" subtitle={me ? `Signed in as ${me.displayName}` : " "} />
      {me?.memberId ? <Calendars /> : me ? <p className="text-sm text-[--cp-muted]">Calendars connect to a consultant account.</p> : null}
      <CoachAudio />
    </div>
  );
}

function Calendars() {
  const cal = useCalendarConnections();
  const [busy, setBusy] = useState<CalendarProvider | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byProvider = new Map<CalendarProvider, CalendarConnection>((cal.data ?? []).map((c) => [c.provider, c]));

  const disconnect = async (p: CalendarProvider) => {
    setBusy(p);
    setError(null);
    try {
      await cal.disconnect(p);
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="cal-h">
      <SectionTitle>
        <span id="cal-h">Calendars</span>
      </SectionTitle>
      <p className="mb-3 text-sm text-[--cp-muted]">
        Meetings you book land in your calendar automatically, in SAST. The clinic gets an invite when you tick it.
      </p>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="mb-2 text-sm text-[--cp-risk]">
            {error}
          </p>
        )}
        {cal.loading ? (
          <SkeletonList rows={2} rowClass="h-[88px]" />
        ) : cal.error && !cal.data ? (
          <LoadError error={cal.error} onRetry={() => void cal.refresh()} />
        ) : (
          <ul className="space-y-2">
            {CALENDAR_PROVIDERS.map((p) => {
              const c = byProvider.get(p);
              const status = c?.status ?? "not_connected";
              return (
                <li key={p} className={cx(SURFACE, "flex flex-wrap items-center gap-3 p-4")}>
                  <CalendarDays size={20} aria-hidden className="shrink-0 text-[--cp-muted]" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[--cp-text]">{PROVIDER_LABELS[p]}</p>
                    <p className="truncate text-sm text-[--cp-muted]">
                      {status === "connected"
                        ? `${c?.accountEmail ?? "Connected"}${c?.connectedAt ? ` · since ${formatSastDate(c.connectedAt)}` : ""}`
                        : status === "error"
                          ? c?.lastError ?? "Needs reconnecting"
                          : "Not connected"}
                    </p>
                  </div>
                  <Chip tone={status === "connected" ? "progress" : status === "error" ? "risk" : "neutral"}>
                    {status === "connected" ? "Connected" : status === "error" ? "Error" : "Off"}
                  </Chip>
                  {status === "connected" ? (
                    <Button variant="ghost" disabled={busy === p} onClick={() => void disconnect(p)}>
                      {busy === p ? "Disconnecting…" : "Disconnect"}
                    </Button>
                  ) : (
                    // Full-page navigation: OAuth needs a real redirect, not fetch.
                    <a href={cal.connectUrl(p)} className={buttonClass("primary", "md")}>
                      {status === "error" ? "Reconnect" : "Connect"}
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function CoachAudio() {
  const audio = useCoachAudio(null);
  const id = "coach-audio";
  return (
    <section aria-labelledby="audio-h">
      <SectionTitle>
        <span id="audio-h">Coach Alex audio cues</span>
      </SectionTitle>
      <div className={cx(SURFACE, "space-y-4 p-4")}>
        <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            id={id}
            type="checkbox"
            role="switch"
            checked={audio.enabled}
            disabled={!audio.supported}
            onChange={(e) => audio.setEnabled(e.target.checked)}
            aria-describedby={`${id}-help`}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[--cp-accent]"
          />
          <span>
            <span className="block text-sm font-medium text-[--cp-text]">Speak a short cue when a new objection card appears</span>
            <span id={`${id}-help`} className="mt-0.5 block text-xs text-[--cp-muted]">
              {audio.supported
                ? "Off by default. Cues only play through a headset, so the clinic never hears them."
                : "This browser can't speak cues."}
            </span>
          </span>
        </label>

        {audio.enabled && (
          <div className="space-y-3 border-t border-[--cp-border] pt-4" aria-live="polite">
            <p className="flex items-center gap-2 text-sm text-[--cp-text]">
              <Headphones size={16} aria-hidden className="text-[--cp-muted]" />
              {audio.output === "headset" ? "Headset detected." : audio.output === "speaker" ? "No headset detected — cues are paused." : "Can't tell what you're listening on."}
            </p>
            {audio.output !== "headset" && (
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={audio.headsetConfirmed}
                  onChange={(e) => audio.confirmHeadset(e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-[--cp-accent]"
                />
                <span className="text-sm text-[--cp-text]">I&apos;m wearing a headset</span>
              </label>
            )}
            <p className={cx("text-sm", audio.canSpeak ? "text-[--cp-progress]" : "text-[--cp-muted]")}>
              {audio.canSpeak ? "Cues are on for your next call." : "Cues will stay quiet until a headset is in use."}
            </p>
            <Button variant="secondary" onClick={audio.test} disabled={!audio.canSpeak} className={FOCUS}>
              <Volume2 size={16} aria-hidden /> Play a test cue
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
