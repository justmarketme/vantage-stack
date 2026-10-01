"use client";

import type { ReactNode } from "react";
import { Lock, WifiOff } from "lucide-react";
import type { Me, Period } from "../../../lib/consultant/types";
import { useOnline } from "../../../hooks/consultant/useOnline";
import { ErrorState, SURFACE } from "../ui";
import { cx, describeError, FOCUS } from "../utils";

/*
 * Small building blocks shared by the wave-2 screens. Colour rules (Rams):
 *   progress (green) = movement toward a goal / money in
 *   coach (blue)     = Coach Alex + informational
 *   risk (red)       = at risk / errors
 *   neutral          = everything else
 */

// ── Permissions (Norman: role-based views) ──────────────────────────────────

export type Permission = "confirm_payments" | "manage_gamification" | "view_system_health" | "view_team_performance";

/** `Me.permissions` is the only source of truth for gating in the UI (the API re-checks). */
export function can(me: Me | undefined, p: Permission): boolean {
  return !!me?.permissions?.includes(p);
}

export function canAny(me: Me | undefined, ps: Permission[]): boolean {
  return ps.some((p) => can(me, p));
}

/** Shown when someone opens a screen their role doesn't include. */
export function NoAccess({ what }: { what: string }) {
  return (
    <div className={cx(SURFACE, "flex items-start gap-3 p-5")} role="alert">
      <Lock size={18} aria-hidden className="mt-0.5 shrink-0 text-[--cp-muted]" />
      <div>
        <p className="font-heading text-base text-[--cp-text]">You don&apos;t have access to {what}</p>
        <p className="mt-1 text-sm text-[--cp-muted]">Ask an admin to add the permission to your role if you need it.</p>
      </div>
    </div>
  );
}

// ── Load / error / offline ──────────────────────────────────────────────────

/**
 * Error with retry, worded for offline when there's no connection — so an
 * offline rep sees "you're offline" rather than a generic failure.
 */
export function LoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const online = useOnline();
  if (!online) {
    return (
      <div className={cx(SURFACE, "flex items-start gap-3 p-4")} role="status">
        <WifiOff size={18} aria-hidden className="mt-0.5 shrink-0 text-[--cp-muted]" />
        <p className="text-sm text-[--cp-text]">
          You&apos;re offline. This screen loads when you&apos;re back on signal — it will refresh by itself.
        </p>
      </div>
    );
  }
  return <ErrorState message={describeError(error, "load")} onRetry={onRetry} />;
}

// ── Progress bar ────────────────────────────────────────────────────────────

type Tone = "progress" | "coach" | "risk" | "neutral";
const FILL: Record<Tone, string> = {
  progress: "bg-[--cp-progress]",
  coach: "bg-[--cp-coach]",
  risk: "bg-[--cp-risk]",
  neutral: "bg-[--cp-muted]",
};

/**
 * Accessible progress bar (role=progressbar). `value` is 0..1 and is clamped;
 * `marker` (0..1) draws a thin target line — e.g. the 30% close target.
 */
export function ProgressBar({
  value,
  label,
  tone = "progress",
  marker,
  markerLabel,
  className,
  height = "h-2",
}: {
  value: number;
  label: string;
  tone?: Tone;
  marker?: number;
  markerLabel?: string;
  className?: string;
  height?: string;
}) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const pct = Math.round(v * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%${markerLabel ? ` · ${markerLabel}` : ""}`}
      className={cx("relative w-full overflow-hidden rounded-full bg-[--cp-surface-3]", height, className)}
    >
      <div className={cx("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", FILL[tone])} style={{ width: `${pct}%` }} />
      {marker != null && marker > 0 && marker < 1 && (
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-[--cp-text]" style={{ left: `${marker * 100}%` }} />
      )}
    </div>
  );
}

// ── Period tabs + segmented control ─────────────────────────────────────────

export const PERIOD_LABELS: Record<Period, string> = { today: "Today", week: "Week", month: "Month", quarter: "Quarter" };

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  labels,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-xl bg-[--cp-surface] p-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={cx(
            "min-h-11 flex-1 rounded-lg px-3 text-sm font-medium sm:flex-none sm:px-4",
            FOCUS,
            value === o ? "bg-[--cp-surface-3] text-[--cp-text]" : "text-[--cp-muted] hover:text-[--cp-text]",
          )}
        >
          {labels[o]}
        </button>
      ))}
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "progress" | "risk";
}) {
  return (
    <div className={cx(SURFACE, "min-h-[92px] p-3")}>
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">{label}</p>
      <p
        className={cx(
          "mt-1 font-heading text-xl tabular-nums",
          tone === "progress" ? "text-[--cp-progress]" : tone === "risk" ? "text-[--cp-risk]" : "text-[--cp-text]",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-[--cp-muted]">{hint}</p>}
    </div>
  );
}

/** 0.3 → "30%", null → "—". */
export function pct(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

/** Whole number with SA grouping (thin space), e.g. 12 500. */
export function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-ZA");
}

// ── Chip ────────────────────────────────────────────────────────────────────

export type ChipTone = "progress" | "risk" | "info" | "health-yellow" | "neutral";
const CHIP: Record<ChipTone, string> = {
  progress: "bg-[--cp-progress-soft] text-[--cp-progress]",
  risk: "bg-[--cp-risk-soft] text-[--cp-risk]",
  info: "bg-[--cp-coach-soft] text-[--cp-coach]",
  "health-yellow": "bg-[--cp-surface-2] text-[--cp-health-yellow]",
  neutral: "bg-[--cp-surface-2] text-[--cp-muted]",
};

/** A labelled status pill. The text always carries the meaning; colour only reinforces it. */
export function Chip({ tone = "neutral", children, className }: { tone?: ChipTone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", CHIP[tone], className)}>
      {children}
    </span>
  );
}
