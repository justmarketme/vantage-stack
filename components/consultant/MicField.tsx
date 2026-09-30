"use client";

import { useId, type InputHTMLAttributes } from "react";
import { Mic, MicOff } from "lucide-react";
import { useSpeechInput } from "../../hooks/consultant/useSpeechInput";
import { cx, FOCUS } from "./utils";

type Kind = "email" | "url" | "phone" | "text";

export const INPUT_CLASS =
  "min-h-12 w-full rounded-xl border bg-[--cp-surface] px-3 text-base text-[--cp-text] placeholder:text-[--cp-muted] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[--cp-accent]";

/**
 * A labelled field with an optional dictation button. Spoken emails / URLs /
 * phone numbers are normalised + validated by `useSpeechInput` before they
 * land in the field ("jane at glow clinic dot co dot za" → jane@glowclinic.co.za).
 * Errors are tied to the input with aria-describedby.
 */
export function MicField({
  label,
  value,
  onChange,
  onBlur,
  kind = "text",
  mic = false,
  error,
  hint,
  required,
  ...inputProps
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  kind?: Kind;
  mic?: boolean;
  error?: string;
  hint?: string;
  required?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onBlur" | "required">) {
  const id = useId();
  const speech = useSpeechInput({
    kind,
    onResult: (v) => onChange(v),
    onInvalid: (v) => onChange(v),
  });
  const showMic = mic && speech.supported;
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null, speech.error ? `${id}-mic` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  const inputType = kind === "email" ? "email" : kind === "url" ? "url" : kind === "phone" ? "tel" : "text";
  const autoComplete = kind === "email" ? "email" : kind === "url" ? "url" : kind === "phone" ? "tel" : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
        {label}
        {required && <span className="text-[--cp-muted]"> (required)</span>}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type={inputType}
          inputMode={kind === "phone" ? "tel" : kind === "email" ? "email" : kind === "url" ? "url" : undefined}
          autoComplete={autoComplete}
          value={speech.listening && speech.interim ? speech.interim : value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          aria-invalid={!!error || undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cx(INPUT_CLASS, error ? "border-[--cp-risk]" : "border-[--cp-border]")}
          {...inputProps}
        />
        {showMic && (
          <button
            type="button"
            onClick={speech.listening ? speech.stop : speech.start}
            aria-pressed={speech.listening}
            aria-label={speech.listening ? `Stop dictating ${label}` : `Dictate ${label}`}
            className={cx(
              "inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-xl border",
              FOCUS,
              speech.listening
                ? "border-[--cp-risk] bg-[--cp-risk-soft] text-[--cp-risk]"
                : "border-[--cp-border] bg-[--cp-surface-2] text-[--cp-text]",
            )}
          >
            {speech.listening ? <MicOff size={20} aria-hidden /> : <Mic size={20} aria-hidden />}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {speech.listening && <p className="mt-1 text-xs text-[--cp-muted]">Listening… say it naturally.</p>}
      </div>
      {speech.error && (
        <p id={`${id}-mic`} className="mt-1 text-xs text-[--cp-risk]">
          {speech.error}
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-[--cp-muted]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-[--cp-risk]">
          {error}
        </p>
      )}
    </div>
  );
}
