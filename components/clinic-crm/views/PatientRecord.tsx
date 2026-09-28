"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Download, MessageSquare, Phone, Trash2 } from "lucide-react";
import { LEAD_STAGES, type Channel, type LeadStage, type Patient } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Skeleton } from "../ui/Skeleton";
import { Textarea } from "../ui/Textarea";
import { useToast } from "@/components/clinic-crm/providers/ToastProvider";
import { BASE } from "./AppShell";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { errorMessage, fieldErrors } from "./errors";
import { LEAD, fullName, initials } from "./format";

/** One patient's record — used full-page and inside the patients Drawer (`compact`). */
export function PatientRecord({
  id,
  compact,
  onChanged,
  onErased,
}: {
  id: string;
  compact?: boolean;
  onChanged?: () => void;
  onErased: () => void;
}) {
  const q = useQuery(`patient:${id}`, () => api.patients.get(id), { persist: false });
  const p = q.data;

  if (!p) {
    return q.error ? (
      <p className="cc-notice" data-tone="danger" role="alert">
        {errorMessage(q.error, "Couldn't load this patient.")}
      </p>
    ) : (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-14 w-2/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const changed = () => {
    q.refresh();
    onChanged?.();
  };

  return (
    <div className="flex flex-col gap-6">
      <RecordHeader p={p} compact={compact} />
      {p.leadStage !== null && <ConvertLead p={p} onDone={changed} />}
      <EditDetails key={p.id} p={p} onSaved={changed} />
      <Privacy p={p} onErased={onErased} />
    </div>
  );
}

function RecordHeader({ p, compact }: { p: Patient; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="cc-heading grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-lg font-semibold cc-surface-2 cc-accent" aria-hidden>
          {initials(fullName(p)) || "?"}
        </span>
        <div className="min-w-0">
          {!compact && <h2 className="truncate text-2xl font-semibold">{fullName(p)}</h2>}
          <p className="cc-muted cc-num text-sm">{p.phone}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {p.leadStage ? <Badge tone={LEAD[p.leadStage].tone}>{LEAD[p.leadStage].label}</Badge> : <Badge tone="success">Patient</Badge>}
            <Badge>{p.preferredChannel === "whatsapp" ? "WhatsApp" : "SMS"}</Badge>
            {p.optedOutAt && <Badge tone="danger">Opted out</Badge>}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={`${BASE}/inbox?patient=${p.id}`} className="cc-btn cc-btn-primary">
          <MessageSquare size={18} aria-hidden /> Message
        </Link>
        <a href={`tel:${p.phone}`} className="cc-btn cc-btn-secondary">
          <Phone size={18} aria-hidden /> Call
        </a>
        {compact && (
          <Link href={`${BASE}/patients/${p.id}`} className="cc-btn cc-btn-ghost">
            Open full record
          </Link>
        )}
      </div>
    </div>
  );
}

function ConvertLead({ p, onDone }: { p: Patient; onDone: () => void }) {
  const { show: toast } = useToast();
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const setStage = async (leadStage: LeadStage) => {
    try {
      await api.patients.update(p.id, { leadStage });
      onDone();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const convert = async () => {
    if (!consent) {
      setError("Confirm the patient’s consent first.");
      return;
    }
    setPending(true);
    try {
      await api.patients.update(p.id, { leadStage: null, consent: true });
      toast("Registered as a patient", "success");
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Couldn't register this patient."));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-2xl p-4" style={{ background: "var(--cc-accent-soft)" }} aria-labelledby={`lead-${p.id}`}>
      <h3 id={`lead-${p.id}`} className="font-semibold">
        This is an enquiry
      </h3>
      <p className="cc-muted mb-4 mt-1 text-sm">Register them as a patient once they’ve agreed to be contacted.</p>
      <div className="flex flex-col gap-4">
        <ConsentCheckbox checked={consent} onChange={(v) => {
            setConsent(v);
            setError(null);
          }} error={error} />
        <div className="flex flex-wrap items-end gap-3">
          <Button variant="primary" loading={pending} onClick={convert}>
            Register as patient
          </Button>
          <Select
            label="Enquiry stage"
            hideLabel
            wrapperClassName="w-44"
            value={p.leadStage ?? "new"}
            onChange={(e) => setStage(e.target.value as LeadStage)}
            options={LEAD_STAGES.map((s) => ({ value: s, label: LEAD[s].label }))}
          />
        </div>
      </div>
    </section>
  );
}

function EditDetails({ p, onSaved }: { p: Patient; onSaved: () => void }) {
  const { show: toast } = useToast();
  const initial = {
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phone,
    email: p.email,
    preferredChannel: p.preferredChannel,
    notes: p.notes,
    tags: p.tags.join(", "),
  };
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const dirty = (Object.keys(initial) as Array<keyof typeof initial>).some((k) => form[k] !== initial[k]);
  const set = (k: keyof typeof initial) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setErrors({});
    try {
      await api.patients.update(p.id, {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        email: form.email,
        preferredChannel: form.preferredChannel,
        notes: form.notes,
        tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      toast("Saved", "success");
      onSaved();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast(errorMessage(err, "Couldn't save changes."), "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4" aria-label="Patient details" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="First name" value={form.firstName} onChange={set("firstName")} error={errors.firstName} />
        <Input label="Last name" value={form.lastName} onChange={set("lastName")} error={errors.lastName} />
      </div>
      <Input label="Mobile number" type="tel" inputMode="tel" value={form.phone} onChange={set("phone")} error={errors.phone} />
      <Textarea label="Notes" hint="Admin notes only — keep clinical information in your practice system." value={form.notes} onChange={set("notes")} error={errors.notes} />
      <Disclosure label="More details">
        <Input label="Email" type="email" value={form.email} onChange={set("email")} error={errors.email} />
        <Select
          label="Preferred channel"
          value={form.preferredChannel}
          onChange={(e) => setForm({ ...form, preferredChannel: e.target.value as Channel })}
          options={[
            { value: "whatsapp", label: "WhatsApp" },
            { value: "sms", label: "SMS" },
          ]}
        />
        <Input label="Tags" hint="Comma-separated, e.g. ortho, medical-aid" value={form.tags} onChange={set("tags")} error={errors.tags} />
      </Disclosure>
      {dirty && (
        <div className="flex gap-2">
          <Button type="submit" variant="primary" loading={pending}>
            Save changes
          </Button>
          <Button variant="ghost" onClick={() => setForm(initial)}>
            Discard
          </Button>
        </div>
      )}
    </form>
  );
}

const ERASE_WORD = "ERASE";

function Privacy({ p, onErased }: { p: Patient; onErased: () => void }) {
  const { show: toast } = useToast();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"export" | "erase" | null>(null);

  const exportData = async () => {
    setBusy("export");
    try {
      const data = await api.patients.export(p.id);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `patient-record-${p.id.slice(0, 8)}.json`; // no name in the filename
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast(errorMessage(e, "Couldn't export this record."), "error");
    } finally {
      setBusy(null);
    }
  };

  const erase = async () => {
    setBusy("erase");
    try {
      await api.patients.remove(p.id);
      toast("Patient record permanently erased", "success");
      onErased();
    } catch (e) {
      toast(errorMessage(e, "Couldn't erase this record."), "error");
      setBusy(null);
    }
  };

  return (
    <section className="cc-divider pt-2">
      <Disclosure label="Privacy & data (POPIA)">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="cc-muted">Consent</dt>
          <dd>{p.consentAt ? new Date(p.consentAt).toLocaleString("en-ZA") : "Not yet given"}</dd>
          <dt className="cc-muted">Messaging</dt>
          <dd>{p.optedOutAt ? `Opted out ${new Date(p.optedOutAt).toLocaleDateString("en-ZA")}` : "Subscribed"}</dd>
        </dl>
        <div>
          <Button onClick={exportData} loading={busy === "export"} icon={<Download size={18} aria-hidden />}>
            Export everything we hold
          </Button>
          <p className="cc-hint">For a patient’s access request (POPIA s.23). Downloads a JSON file.</p>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-danger)" }}>
          <h4 className="cc-danger-text font-semibold">Erase this patient</h4>
          <p className="cc-muted mb-3 mt-1 text-sm">
            Permanently deletes {p.firstName}’s record, messages and appointments. This cannot be undone.
          </p>
          <Input
            label={`Type ${ERASE_WORD} to confirm`}
            autoComplete="off"
            autoCapitalize="characters"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <Button
            variant="danger"
            className="mt-3"
            disabled={confirm.trim() !== ERASE_WORD}
            loading={busy === "erase"}
            onClick={erase}
            icon={<Trash2 size={18} aria-hidden />}
          >
            Erase permanently
          </Button>
        </div>
      </Disclosure>
    </section>
  );
}
