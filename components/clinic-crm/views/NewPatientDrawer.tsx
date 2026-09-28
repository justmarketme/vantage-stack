"use client";

import { useState, type FormEvent } from "react";
import { PatientInput, type Channel, type Patient } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useContinuity } from "@/lib/clinic-crm/client/continuity";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { Drawer } from "../ui/Drawer";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { ConsentCheckbox } from "./ConsentCheckbox";
import { errorMessage, fieldErrors } from "./errors";

interface Draft {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  preferredChannel: Channel;
  notes: string;
}
const EMPTY: Draft = { firstName: "", lastName: "", phone: "", email: "", preferredChannel: "whatsapp", notes: "" };

const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
] as const;

/**
 * The draft follows the staff member across devices; consent deliberately does
 * not — it must be affirmed with the patient at the moment of saving.
 */
export function NewPatientDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Patient) => void;
}) {
  const [draft, setDraft] = useContinuity<Draft>("draft:new-patient", EMPTY);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft({ ...draft, [k]: v });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const parsed = PatientInput.safeParse({ ...draft, consent, tags: [] });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const created = await api.patients.create(parsed.data);
      setDraft(EMPTY);
      setConsent(false);
      onCreated(created);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err, "Couldn't save the patient."));
    } finally {
      setPending(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New patient"
      description="Name, mobile and consent are all you need to start."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="cc-new-patient" loading={pending}>
            Save patient
          </Button>
        </>
      }
    >
      <form id="cc-new-patient" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            autoComplete="off"
            value={draft.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            error={errors.firstName}
            data-autofocus
          />
          <Input label="Last name" autoComplete="off" value={draft.lastName} onChange={(e) => set("lastName", e.target.value)} error={errors.lastName} />
        </div>
        <Input
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="082 123 4567"
          hint="SA numbers are converted to international format automatically."
          value={draft.phone}
          onChange={(e) => set("phone", e.target.value)}
          error={errors.phone}
        />
        <ConsentCheckbox checked={consent} onChange={setConsent} error={errors.consent} />
        <Disclosure>
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={draft.email}
            onChange={(e) => set("email", e.target.value)}
            error={errors.email}
          />
          <Select
            label="Preferred channel"
            options={CHANNEL_OPTIONS}
            value={draft.preferredChannel}
            onChange={(e) => set("preferredChannel", e.target.value as Channel)}
          />
          <Textarea label="Notes" hint="Admin notes only — keep clinical information in your practice system." value={draft.notes} onChange={(e) => set("notes", e.target.value)} error={errors.notes} />
        </Disclosure>
        {formError && (
          <p className="cc-notice" data-tone="danger" role="alert">
            {formError}
          </p>
        )}
      </form>
    </Drawer>
  );
}
