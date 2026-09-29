"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import type { Patient } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Skeleton } from "../ui/Skeleton";
import { fullName } from "./format";
import { useDebounced } from "./useDebounced";

/** Search-as-you-type patient chooser; collapses to a chip once chosen. */
export function PatientPicker({
  value,
  onChange,
  error,
}: {
  value: Patient | null;
  onChange: (p: Patient | null) => void;
  error?: string | null;
}) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const results = useQuery(`picker:${dq}`, () => api.patients.list(dq || undefined), { persist: false });

  if (value) {
    return (
      <div>
        <span className="cc-label">Patient</span>
        <div className="flex items-center gap-3 rounded-xl p-3 cc-surface-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{fullName(value)}</p>
            <p className="cc-muted cc-num text-sm">{value.phone}</p>
          </div>
          <Button variant="ghost" size="sm" iconOnly aria-label="Change patient" onClick={() => onChange(null)}>
            <X size={18} aria-hidden />
          </Button>
        </div>
      </div>
    );
  }

  const rows = (results.data ?? []).slice(0, 6);
  return (
    <div>
      <div className="relative">
        <Search size={18} aria-hidden className="cc-muted pointer-events-none absolute left-4 top-[38px]" />
        <Input
          label="Patient"
          type="search"
          placeholder="Search by name or number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          error={error}
          className="pl-11"
          data-autofocus
        />
      </div>
      <ul className="mt-2 flex flex-col gap-1" role="list" aria-label="Matching patients">
        {results.loading && !results.data
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full" />)
          : rows.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChange(p)}
                  className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-[color:var(--cc-surface-2)]"
                >
                  <span className="truncate font-medium">{fullName(p)}</span>
                  <span className="cc-muted cc-num shrink-0 text-sm">{p.phone}</span>
                </button>
              </li>
            ))}
        {results.data && rows.length === 0 && <li className="cc-muted px-3 py-2 text-sm">No patients match — add them on the Patients page first.</li>}
      </ul>
    </div>
  );
}
