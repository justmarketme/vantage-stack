"use client";

import { useState } from "react";
import { ChevronRight, Plus, Search, Users } from "lucide-react";
import type { Patient } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useContinuity } from "@/lib/clinic-crm/client/continuity";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Drawer } from "../ui/Drawer";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Input";
import { Segmented } from "../ui/Segmented";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "@/components/clinic-crm/providers/ToastProvider";
import { NewPatientDrawer } from "./NewPatientDrawer";
import { PageHeader } from "./PageHeader";
import { PatientRecord } from "./PatientRecord";
import { errorMessage } from "./errors";
import { LEAD, fmtStamp, fullName, initials } from "./format";
import { useDebounced } from "./useDebounced";

type View = "patients" | "leads";

export function PatientsView() {
  const { show: toast } = useToast();
  const [filter, setFilter] = useContinuity<{ view: View }>("filter:patients", { view: "patients" });
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const leads = filter.view === "leads";
  const list = useQuery(`patients:${filter.view}:${dq}`, () => api.patients.list(dq || undefined, { lead: leads }), {
    persist: false, // rows carry clinical notes
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = list.data ?? [];
  const openRow = rows.find((r) => r.id === openId);

  return (
    <div className="cc-page">
      <PageHeader
        title="Patients"
        subtitle={leads ? "Enquiries that haven’t become patients yet." : "Everyone registered at your practice."}
        actions={
          <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setCreating(true)}>
            New patient
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={18} aria-hidden className="cc-muted pointer-events-none absolute left-4 top-[13px]" />
          <Input
            label="Search patients"
            hideLabel
            type="search"
            placeholder="Search by name or number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-11"
          />
        </div>
        <Segmented<View>
          label="Show"
          value={filter.view}
          onChange={(view) => setFilter({ view })}
          options={[
            { value: "patients", label: "Patients" },
            { value: "leads", label: "Leads" },
          ]}
        />
      </div>

      <div className="cc-card overflow-hidden">
        {list.loading && !list.data ? (
          <div className="flex flex-col gap-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : list.error && !list.data ? (
          <p className="cc-notice m-4" data-tone="danger" role="alert">
            {errorMessage(list.error, "Couldn't load patients.")}
          </p>
        ) : rows.length === 0 ? (
          dq ? (
            <EmptyState icon={<Search size={26} />} title="No matches">
              Nobody matches “{dq}”. Try part of a name or the last digits of their number.
            </EmptyState>
          ) : leads ? (
            <EmptyState icon={<Users size={26} />} title="No open enquiries">
              When someone new messages your WhatsApp or SMS number, they land here — and get an instant reply automatically.
            </EmptyState>
          ) : (
            <EmptyState
              icon={<Users size={26} />}
              title="Add your first patient"
              action={
                <Button variant="primary" icon={<Plus size={18} aria-hidden />} onClick={() => setCreating(true)}>
                  New patient
                </Button>
              }
            >
              You only need a name, a mobile number and their consent. Reminders start working as soon as you book them in.
            </EmptyState>
          )
        ) : (
          <ul role="list">
            {rows.map((p, i) => (
              <li key={p.id} className={i ? "cc-divider" : undefined}>
                <PatientRow p={p} onOpen={() => setOpenId(p.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={openId !== null}
        onClose={() => setOpenId(null)}
        title={openRow ? fullName(openRow) : "Patient"}
      >
        {openId && (
          <PatientRecord
            id={openId}
            compact
            onChanged={() => list.refresh()}
            onErased={() => {
              setOpenId(null);
              list.refresh();
            }}
          />
        )}
      </Drawer>

      <NewPatientDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(p) => {
          setCreating(false);
          toast("Patient added", "success");
          list.refresh();
          setOpenId(p.id);
        }}
      />
    </div>
  );
}

function PatientRow({ p, onOpen }: { p: Patient; onOpen: () => void }) {
  const name = fullName(p);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--cc-surface-2)] md:px-5"
    >
      <span className="cc-heading grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold cc-surface-2" aria-hidden>
        {initials(name) || "?"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{name}</span>
        <span className="cc-muted cc-num block truncate text-sm">{p.phone}</span>
      </span>
      <span className="hidden flex-wrap justify-end gap-2 sm:flex">
        {p.leadStage && <Badge tone={LEAD[p.leadStage].tone}>{LEAD[p.leadStage].label}</Badge>}
        {p.optedOutAt && <Badge tone="danger">Opted out</Badge>}
      </span>
      <span className="cc-muted hidden text-xs md:block">{fmtStamp(p.createdAt)}</span>
      <ChevronRight size={18} aria-hidden className="cc-muted shrink-0" />
    </button>
  );
}
