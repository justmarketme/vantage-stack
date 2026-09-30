"use client";

import Link from "next/link";
import { memo } from "react";
import { CloudUpload, PhoneCall, WifiOff } from "lucide-react";
import { useCall, useCoach } from "../VoiceCallProvider";
import { CallTimer } from "../call/CallTimer";
import { cx, FOCUS } from "../utils";

/**
 * Offline + pending-sync status. Quiet when all is well; one line when not.
 * `aria-live` so a screen reader hears "offline" / "synced" transitions.
 */
export const OfflineBanner = memo(function OfflineBanner({ online, pending }: { online: boolean; pending: number }) {
  const show = !online || pending > 0;
  return (
    <div aria-live="polite" role="status">
      {show && (
        <div
          className={cx(
            "flex items-center gap-2 px-4 py-2 text-sm",
            online ? "bg-[--cp-surface] text-[--cp-muted]" : "bg-[--cp-objection-soft] text-[--cp-objection]",
          )}
        >
          {online ? <CloudUpload size={16} aria-hidden /> : <WifiOff size={16} aria-hidden />}
          <span className="min-w-0 flex-1">
            {online
              ? `Syncing ${pending} saved ${pending === 1 ? "change" : "changes"}…`
              : "You're offline. Notes are saved on this device and sync when you're back. Calls need a connection."}
          </span>
          {!online && pending > 0 && (
            <span className="shrink-0 rounded-full bg-[--cp-surface] px-2 py-0.5 text-xs text-[--cp-text]">
              {pending} waiting
            </span>
          )}
        </div>
      )}
    </div>
  );
});

/**
 * Phone/tablet: a slim "on call" bar above the tab bar when the rep leaves the
 * live-call screen. Shows the newest Coach Alex card title so nothing is missed.
 */
export function OnCallBar() {
  const voice = useCall();
  const { active } = useCoach();
  if (!voice.call || (!voice.live && !voice.needsWrapUp)) return null;
  const href = `/consultant/call/${voice.call.id}`;
  const tone =
    active?.severity === "high_risk" ? "cp-edge-high_risk" : active?.severity === "stall" ? "cp-edge-stall" : "cp-edge-guide";
  return (
    <div
      className="fixed inset-x-3 z-30 lg:hidden"
      style={{ bottom: "calc(4rem + var(--cp-safe-bottom) + 8px)" }}
    >
      <Link
        href={href}
        className={cx("flex min-h-14 items-center gap-3 rounded-2xl bg-[--cp-surface-2] px-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)]", tone, FOCUS)}
      >
        <PhoneCall size={18} className="text-[--cp-progress]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-[--cp-text]">
            {voice.live ? "On a call — tap to return" : "Call ended — tap to wrap up"}
          </span>
          {active && voice.live && (
            <span className="block truncate text-xs text-[--cp-muted]">Coach Alex: {active.title}</span>
          )}
        </span>
        {voice.live && <CallTimer className="text-sm text-[--cp-muted]" />}
      </Link>
    </div>
  );
}
