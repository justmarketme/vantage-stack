"use client";

import { useId, useState } from "react";
import { Phone } from "lucide-react";
import { useOnline } from "../../hooks/consultant/useOnline";
import type { Lead } from "../../lib/consultant/types";
import { callBlockReason, useMe } from "./MeProvider";
import { useCall } from "./VoiceCallProvider";
import { buttonClass } from "./ui";
import { cx } from "./utils";

/**
 * The one way to start a call. Disabled states always say why (Norman):
 * offline, read-only access, no number, already on a call, unsupported browser.
 * Calling-not-configured (503) and mic-denied come back from the voice hook as
 * friendly sentences and are shown right under the button that was tapped.
 */
export function CallButton({
  lead,
  size = "md",
  showReason = false,
  className,
}: {
  lead: Pick<Lead, "id" | "phone" | "clinicName">;
  size?: "md" | "xl";
  /** Show the disabled reason as visible text (workspace) rather than only a tooltip (lists). */
  showReason?: boolean;
  className?: string;
}) {
  const voice = useCall();
  const { me } = useMe();
  const online = useOnline();
  const reasonId = useId();
  const [tapped, setTapped] = useState(false);

  const reason =
    callBlockReason(me, online) ??
    (!voice.supported ? "This browser can't make calls. Use the latest Chrome, Edge or Safari." : null) ??
    (!lead.phone ? "No phone number on this lead." : null) ??
    (voice.live ? "You're already on a call." : null);

  const connecting = tapped && (voice.state === "connecting" || voice.state === "ringing");
  const failed = tapped && voice.state === "error" && !!voice.error;

  const onClick = async () => {
    setTapped(true);
    await voice.startAndOpen(lead.id);
  };

  const big = size === "xl";
  return (
    <div className={cx("flex flex-col", big ? "items-stretch" : "items-end", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={!!reason || connecting}
        aria-describedby={reason || failed ? reasonId : undefined}
        title={reason ?? `Call ${lead.clinicName}`}
        aria-label={big ? undefined : `Call ${lead.clinicName}`}
        className={buttonClass("primary", big ? "xl" : "md", big ? "w-full text-lg" : "min-w-11 px-3")}
      >
        <Phone size={big ? 22 : 18} aria-hidden />
        {big ? (connecting ? "Connecting…" : "Call") : <span className="hidden sm:inline">{connecting ? "…" : "Call"}</span>}
      </button>
      {(failed || (reason && showReason)) && (
        <p id={reasonId} role={failed ? "alert" : undefined} className={cx("mt-1.5 text-sm", failed ? "text-[--cp-risk]" : "text-[--cp-muted]", big ? "text-left" : "max-w-[16rem] text-right")}>
          {failed ? voice.error : reason}
        </p>
      )}
      {!showReason && reason && !failed && (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      )}
    </div>
  );
}
