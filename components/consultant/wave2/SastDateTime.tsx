"use client";

import { useId } from "react";
import { isoToSastWallClock, sastToday, sastWallClockToIso } from "../../../lib/consultant/client/format";
import { INPUT_CLASS } from "../MicField";
import { cx } from "../utils";

/*
 * Date + time pickers that always mean SAST (Africa/Johannesburg), whatever
 * timezone the phone is set to. The browser's datetime-local input uses the
 * DEVICE zone, so we use separate date/time inputs and convert the wall-clock
 * value with Agent 2's `sastWallClockToIso`.
 */

export type SastParts = { date: string; time: string };

/** ISO instant → SAST wall-clock `{ date: "YYYY-MM-DD", time: "HH:mm" }` (empty when unset). */
export function isoToSast(iso: string | null | undefined): SastParts {
  return isoToSastWallClock(iso) ?? { date: "", time: "" };
}

/** Today's SAST date key, optionally shifted by whole days. */
export function sastDateKey(offsetDays = 0, now = Date.now()): string {
  return sastToday(new Date(now + offsetDays * 86_400_000));
}

/** SAST wall clock → ISO instant, or null when either part is missing/invalid. */
export function sastToIso({ date, time }: SastParts): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  return sastWallClockToIso(date, time);
}

/** Labelled date + time pair. `required` shows the asterisk; validation is the caller's. */
export function SastDateTimeField({
  label,
  value,
  onChange,
  error,
  minDate,
  timeStepMin = 15,
  showTime = true,
  disabled,
}: {
  label: string;
  value: SastParts;
  onChange: (v: SastParts) => void;
  error?: string;
  minDate?: string;
  timeStepMin?: number;
  showTime?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <fieldset disabled={disabled} aria-describedby={error ? errId : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-[--cp-text]">
        {label} <span className="font-normal text-[--cp-muted]">(SAST)</span>
      </legend>
      <div className={cx("grid gap-2", showTime ? "grid-cols-[3fr_2fr]" : "grid-cols-1")}>
        <label htmlFor={`${id}-d`} className="sr-only">
          {label} date
        </label>
        <input
          id={`${id}-d`}
          type="date"
          min={minDate}
          value={value.date}
          aria-invalid={!!error}
          onChange={(e) => onChange({ ...value, date: e.target.value })}
          className={cx(INPUT_CLASS, "[color-scheme:dark]", error ? "border-[--cp-risk]" : "border-[--cp-border]")}
        />
        {showTime && (
          <>
            <label htmlFor={`${id}-t`} className="sr-only">
              {label} time
            </label>
            <input
              id={`${id}-t`}
              type="time"
              step={timeStepMin * 60}
              value={value.time}
              aria-invalid={!!error}
              onChange={(e) => onChange({ ...value, time: e.target.value })}
              className={cx(INPUT_CLASS, "[color-scheme:dark]", error ? "border-[--cp-risk]" : "border-[--cp-border]")}
            />
          </>
        )}
      </div>
      {error && (
        <p id={errId} className="mt-1 text-sm text-[--cp-risk]">
          {error}
        </p>
      )}
    </fieldset>
  );
}
