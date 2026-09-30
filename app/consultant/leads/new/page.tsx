"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../../lib/consultant/client/api";
import { useOnline } from "../../../../hooks/consultant/useOnline";
import { invalidateQueries } from "../../../../hooks/consultant/useQuery";
import { LeadInput } from "../../../../lib/consultant/types";
import { useMe } from "../../../../components/consultant/MeProvider";
import { INPUT_CLASS, MicField } from "../../../../components/consultant/MicField";
import { Button, PageHeader } from "../../../../components/consultant/ui";
import { cx, describeError, errorFields, fromLocalInput } from "../../../../components/consultant/utils";

type Values = {
  clinicName: string;
  contactName: string;
  contactRole: string;
  phone: string;
  email: string;
  website: string;
  city: string;
  source: string;
  nextAction: string;
  nextActionAt: string; // datetime-local
};

const EMPTY: Values = {
  clinicName: "",
  contactName: "",
  contactRole: "",
  phone: "",
  email: "",
  website: "",
  city: "",
  source: "",
  nextAction: "",
  nextActionAt: "",
};

function toInput(v: Values) {
  return { ...v, nextActionAt: fromLocalInput(v.nextActionAt) ?? undefined };
}

/** Field → first validation message, from the same zod schema the server uses. */
function validate(v: Values): Record<string, string> {
  const r = LeadInput.safeParse(toInput(v));
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const issue of r.error.issues) {
    const k = String(issue.path[0] ?? "form");
    if (!out[k]) out[k] = issue.message;
  }
  return out;
}

export default function NewLeadPage() {
  const router = useRouter();
  const online = useOnline();
  const { me } = useMe();
  const [values, setValues] = useState<Values>(EMPTY);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const errors = useMemo(() => validate(values), [values]);
  const shown = (k: keyof Values) => serverErrors[k] ?? ((touched[k] || submitted) ? errors[k] : undefined);

  const set = (k: keyof Values) => (v: string) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    if (serverErrors[k]) {
      setServerErrors((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
    }
  };
  const touch = (k: keyof Values) => () => setTouched((t) => ({ ...t, [k]: true }));

  const readOnly = me ? !me.canCall : false;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setFormError(null);
    const parsed = LeadInput.safeParse(toInput(values));
    if (!parsed.success) {
      const first = document.querySelector<HTMLInputElement>("[aria-invalid='true']");
      first?.focus();
      return;
    }
    setSaving(true);
    try {
      const lead = await api.leads.create(parsed.data);
      void invalidateQueries("leads:");
      router.push(`/consultant/leads/${lead.id}`);
    } catch (err) {
      const f = errorFields(err);
      if (f) setServerErrors(f);
      setFormError(describeError(err, "save"));
      setSaving(false);
    }
  };

  const disabledReason = !online
    ? "You're offline — adding a clinic needs a connection (we check it isn't already in the CRM)."
    : readOnly
      ? "Read-only access: sign in with your consultant account to add clinics."
      : null;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New clinic" subtitle="Just the essentials — you can add the rest after the first call." />
      <form noValidate onSubmit={onSubmit} className="space-y-4">
        <MicField label="Clinic name" required value={values.clinicName} onChange={set("clinicName")} onBlur={touch("clinicName")} error={shown("clinicName")} autoComplete="organization" />
        <MicField
          label="Phone"
          required
          kind="phone"
          mic
          value={values.phone}
          onChange={set("phone")}
          onBlur={touch("phone")}
          error={shown("phone")}
          hint="SA numbers like 082 123 4567 are fine."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <MicField label="Contact name" value={values.contactName} onChange={set("contactName")} onBlur={touch("contactName")} error={shown("contactName")} autoComplete="name" />
          <MicField label="Role" value={values.contactRole} onChange={set("contactRole")} onBlur={touch("contactRole")} error={shown("contactRole")} placeholder="Owner, practice manager…" />
        </div>
        <MicField label="Email" kind="email" mic value={values.email} onChange={set("email")} onBlur={touch("email")} error={shown("email")} />
        <MicField label="Website" kind="url" mic value={values.website} onChange={set("website")} onBlur={touch("website")} error={shown("website")} placeholder="glowclinic.co.za" />
        <div className="grid gap-4 sm:grid-cols-2">
          <MicField label="City" value={values.city} onChange={set("city")} onBlur={touch("city")} error={shown("city")} autoComplete="address-level2" />
          <MicField label="Source" value={values.source} onChange={set("source")} onBlur={touch("source")} error={shown("source")} placeholder="Instagram, referral…" />
        </div>

        <fieldset className="space-y-4 rounded-2xl border border-[--cp-border] p-4">
          <legend className="px-1 text-sm text-[--cp-muted]">Next action (optional)</legend>
          <MicField label="What" value={values.nextAction} onChange={set("nextAction")} onBlur={touch("nextAction")} error={shown("nextAction")} placeholder="First call" />
          <div>
            <label htmlFor="nl-when" className="mb-1.5 block text-sm font-medium text-[--cp-text]">
              When
            </label>
            <input
              id="nl-when"
              type="datetime-local"
              value={values.nextActionAt}
              onChange={(e) => set("nextActionAt")(e.target.value)}
              className={cx(INPUT_CLASS, "border-[--cp-border] [color-scheme:dark]")}
            />
          </div>
        </fieldset>

        <div aria-live="assertive">
          {formError && (
            <p role="alert" className="rounded-xl bg-[--cp-risk-soft] px-4 py-3 text-sm text-[--cp-text]">
              {formError}
            </p>
          )}
        </div>

        <div className="sticky bottom-[calc(4rem+var(--cp-safe-bottom)+0.5rem)] z-10 bg-[--cp-bg] pb-2 pt-2 lg:static">
          <Button type="submit" variant="primary" size="xl" className="w-full" disabled={saving || !!disabledReason} aria-describedby={disabledReason ? "nl-why" : undefined}>
            {saving ? "Saving…" : "Save clinic"}
          </Button>
          {disabledReason && (
            <p id="nl-why" className="mt-2 text-center text-sm text-[--cp-muted]">
              {disabledReason}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
