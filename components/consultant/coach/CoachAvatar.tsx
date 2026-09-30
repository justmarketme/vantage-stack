"use client";

import { memo } from "react";
import { cx } from "../utils";

/**
 * Coach Alex's mark: a calm cyan monogram inside a listening ring (SVG, no
 * library). When `pulseKey` changes (new advice), one soft ring expands —
 * disabled under prefers-reduced-motion via theme.css.
 */
export const CoachAvatar = memo(function CoachAvatar({
  pulseKey,
  size = 36,
  severity,
}: {
  pulseKey?: string | null;
  size?: number;
  severity?: "high_risk" | "stall" | "guide" | null;
}) {
  const ring =
    severity === "high_risk" ? "border-[--cp-risk]" : severity === "stall" ? "border-[--cp-stall]" : "border-[--cp-coach]";
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      {pulseKey && <span key={pulseKey} className={cx("cp-avatar-ping absolute inset-0 rounded-full border-2", ring)} />}
      <svg viewBox="0 0 40 40" width={size} height={size} className="relative">
        <circle cx="20" cy="20" r="19" fill="var(--cp-surface-2)" stroke="var(--cp-coach)" strokeOpacity="0.55" strokeWidth="1.5" />
        {/* three listening bars — Coach Alex is always listening */}
        <rect x="12.5" y="16" width="3" height="8" rx="1.5" fill="var(--cp-coach)" opacity="0.7" />
        <rect x="18.5" y="12" width="3" height="16" rx="1.5" fill="var(--cp-coach)" />
        <rect x="24.5" y="15" width="3" height="10" rx="1.5" fill="var(--cp-coach)" opacity="0.7" />
      </svg>
    </span>
  );
});
