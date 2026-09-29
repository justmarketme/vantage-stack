"use client";

import { useId } from "react";
import { ShieldCheck } from "lucide-react";
import { useSession } from "@/components/clinic-crm/providers/SessionProvider";

/** POPIA s.11 consent, in plain words the receptionist can read to the patient. Never pre-ticked. */
export function ConsentCheckbox({
  checked,
  onChange,
  error,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  error?: string | null;
}) {
  const id = useId();
  const { session } = useSession();
  const clinic = session?.clinicName ?? "the clinic";
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: error ? "var(--cc-danger)" : undefined }}>
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          className="cc-checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={`${id}-more`}
          required
        />
        <label htmlFor={id} className="text-sm leading-relaxed">
          <span className="font-semibold">The patient consents</span> to {clinic} storing their contact details and using them
          to contact them about their care — appointment reminders, follow-ups and recalls — by WhatsApp or SMS.
        </label>
      </div>
      <p id={`${id}-more`} className="cc-muted mt-3 flex gap-2 text-xs leading-relaxed">
        <ShieldCheck size={14} aria-hidden className="mt-px shrink-0" />
        They can withdraw at any time by replying STOP. Your name and the time are recorded with this consent (POPIA).
      </p>
      {error && (
        <p className="cc-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
