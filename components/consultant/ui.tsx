"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cx, FOCUS } from "./utils";

/*
 * Consultant Portal primitives. Every colour comes from theme.css tokens.
 * Targets are ≥ 44px; every interactive element has the shared FOCUS ring.
 */

export const SURFACE = "rounded-2xl border border-[--cp-border] bg-[--cp-surface]";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "progress";
type Size = "md" | "lg" | "xl";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-[--cp-accent-strong] text-[--cp-on-strong] hover:brightness-110",
  secondary: "bg-[--cp-surface-2] text-[--cp-text] border border-[--cp-border] hover:bg-[--cp-surface-3]",
  ghost: "text-[--cp-muted] hover:text-[--cp-text] hover:bg-[--cp-surface-2]",
  danger: "bg-[--cp-risk-strong] text-[--cp-on-strong] hover:brightness-110",
  progress: "bg-[--cp-progress-soft] text-[--cp-progress] border border-[--cp-border] hover:bg-[--cp-surface-3]",
};

const SIZES: Record<Size, string> = {
  md: "min-h-11 px-4 text-sm gap-2 rounded-xl",
  lg: "min-h-12 px-5 text-base gap-2 rounded-xl",
  xl: "min-h-14 px-6 text-base gap-2.5 rounded-2xl",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", extra?: string): string {
  return cx(
    "inline-flex items-center justify-center font-medium transition-[filter,background-color,color] duration-150 select-none",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    FOCUS,
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }
>(function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }, ref) {
  return <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />;
});

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("cp-skeleton rounded-lg", className)} />;
}

/** Fixed-height skeleton rows — the list below never jumps when data arrives. */
export function SkeletonList({ rows = 4, rowClass = "h-[76px]" }: { rows?: number; rowClass?: string }) {
  return (
    <div className="space-y-2" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={cx("rounded-2xl", rowClass)} />
      ))}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={cx(SURFACE, "flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center", className)}>
      <p className="flex-1 text-sm text-[--cp-text]">{message}</p>
      {onRetry && (
        <Button size="md" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: ReactNode;
  action?: { href: string; label: string };
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[--cp-border-strong] px-5 py-8 text-center">
      <p className="font-heading text-base text-[--cp-text]">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-sm text-[--cp-muted]">{body}</p>}
      {action && (
        <Link href={action.href} className={buttonClass("primary", "md", "mt-4")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="font-heading text-sm font-medium uppercase tracking-[0.14em] text-[--cp-muted]">{children}</h2>
      {aside}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-medium leading-tight text-[--cp-text] md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 truncate text-sm text-[--cp-muted]">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Screen-reader-only text. */
export function SrOnly({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
