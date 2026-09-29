"use client";

import { useId, type ReactNode } from "react";

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Visually hide the label (still announced). */
  hideLabel?: boolean;
  className?: string;
  children: (ids: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/** Label + hint + error wiring shared by Input, Select and Textarea. */
export function Field({ label, hint, error, hideLabel, className, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-err` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className={hideLabel ? "cc-sr-only" : "cc-label"}>
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {hint && (
        <p id={hintId} className="cc-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="cc-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
