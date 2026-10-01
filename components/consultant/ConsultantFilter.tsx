"use client";

import { useId } from "react";
import type { Lead } from "../../lib/consultant/types";
import { cx, FOCUS } from "./utils";

export type ConsultantOption = { id: string; name: string };

/** Distinct owners in a lead list, sorted by name. */
export function consultantsFrom(leads: Lead[]): ConsultantOption[] {
  const m = new Map<string, string>();
  for (const l of leads) if (l.consultantId) m.set(l.consultantId, l.consultantName ?? "Unnamed");
  return Array.from(m, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** Managers only: narrow a view to one consultant. */
export function ConsultantFilter({
  consultants,
  value,
  onChange,
  className,
}: {
  consultants: ConsultantOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1", className)}>
      <label htmlFor={id} className="sr-only">
        Consultant
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(
          "min-h-11 rounded-xl border border-[--cp-border] bg-[--cp-surface] px-3 text-sm text-[--cp-text]",
          FOCUS,
        )}
      >
        <option value="">All consultants</option>
        {consultants.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
