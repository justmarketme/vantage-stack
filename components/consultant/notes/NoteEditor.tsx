"use client";

import { useId, useRef, useEffect, type KeyboardEvent } from "react";
import { Button } from "../ui";
import { cx, FOCUS } from "../utils";

/**
 * Controlled note textarea + save/cancel. Storage (draft) and sending (outbox)
 * belong to the caller, so the same editor serves new notes, edits and the
 * in-call quick note. ⌘/Ctrl+Enter saves.
 */
export function NoteEditor({
  value,
  onChange,
  onSave,
  onCancel,
  saveLabel = "Save note",
  label = "Note",
  placeholder = "What happened, what's next…",
  autoFocus = false,
  rows = 4,
  status,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
  /** e.g. "Draft saved on this device". */
  status?: string | null;
  disabled?: boolean;
}) {
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSave && value.trim()) {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cx(
          "w-full resize-y rounded-xl border border-[--cp-border] bg-[--cp-surface-2] p-3 text-base text-[--cp-text] placeholder:text-[--cp-muted]",
          FOCUS,
        )}
      />
      {(onSave || onCancel || status) && (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-[--cp-muted]" aria-live="polite">
            {status}
          </p>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {onSave && (
            <Button variant="primary" onClick={onSave} disabled={disabled || !value.trim()}>
              {saveLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
