"use client";

import { useState, type ReactNode } from "react";
import { Lock, Zap } from "lucide-react";
import { AutomationPatch, type Automation, type AutomationKind } from "@/lib/clinic-crm/types";
import { api } from "@/lib/clinic-crm/client/api";
import { useQuery } from "@/lib/clinic-crm/client/query";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { EmptyState } from "../ui/EmptyState";
import { Input } from "../ui/Input";
import { Skeleton } from "../ui/Skeleton";
import { Switch } from "../ui/Switch";
import { Textarea } from "../ui/Textarea";
import { useSession } from "@/components/clinic-crm/providers/SessionProvider";
import { useToast } from "@/components/clinic-crm/providers/ToastProvider";
import { canManage } from "./AppShell";
import { PageHeader } from "./PageHeader";
import { errorMessage } from "./errors";
import { AUTOMATION_ORDER } from "./format";

/** Each automation reads as one sentence; `offset` is the only number reception ever needs to touch. */
const SENTENCE: Record<AutomationKind, { before: string; after?: string; unit?: string; detail: string }> = {
  new_lead_ack: {
    before: "Reply instantly to every new enquiry",
    detail: "Answers first-time WhatsApp and SMS messages within seconds, day or night.",
  },
  appointment_reminder: {
    before: "Remind patients",
    after: "hours before their appointment",
    unit: "hours",
    detail: "The patient can reply to confirm or reschedule.",
  },
  no_show_followup: {
    before: "Follow up with no-shows",
    after: "hours after a missed appointment",
    unit: "hours",
    detail: "Sent when you mark someone as a no-show, with an offer to rebook.",
  },
  recall: {
    before: "Invite patients back",
    after: "days after their last visit",
    unit: "days",
    detail: "For check-ups and routine care. Opted-out patients are never contacted.",
  },
};

export function AutomationsView() {
  const { session } = useSession();
  const editable = canManage(session);
  const list = useQuery("automations", () => api.automations.list());
  const rows = [...(list.data ?? [])].sort((a, b) => AUTOMATION_ORDER.indexOf(a.kind) - AUTOMATION_ORDER.indexOf(b.kind));

  return (
    <div className="cc-page max-w-[860px]">
      <PageHeader title="Automations" subtitle="Messages your clinic sends for you, so nobody has to remember." />

      {session && !editable && (
        <p className="cc-notice mb-4" data-tone="info">
          <Lock size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>Only an owner or practice manager can change automations. You can see what’s running.</span>
        </p>
      )}

      {list.loading && !list.data ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : list.error && !list.data ? (
        <p className="cc-notice" data-tone="danger" role="alert">
          {errorMessage(list.error, "Couldn't load automations.")}
        </p>
      ) : rows.length === 0 ? (
        <div className="cc-card">
          <EmptyState icon={<Zap size={26} />} title="No automations set up yet">
            Your Vantage Stack team switches these on during onboarding. Get in touch if you’re expecting them.
          </EmptyState>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" role="list">
          {rows.map((a) => (
            <li key={a.id}>
              <AutomationCard a={a} editable={editable} onSaved={() => list.refresh()} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AutomationCard({ a, editable, onSaved }: { a: Automation; editable: boolean; onSaved: () => void }) {
  const { show: toast } = useToast();
  const s = SENTENCE[a.kind];
  const [enabled, setEnabled] = useState(a.enabled);
  const [offset, setOffset] = useState(String(a.offset));
  const [body, setBody] = useState(a.body);
  const [contentSid, setContentSid] = useState(a.contentSid);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const sentence = `${s.before}${s.after ? ` ${offset} ${s.after}` : ""}`;

  const save = async (patch: Record<string, unknown>, done: string): Promise<boolean> => {
    const parsed = AutomationPatch.safeParse(patch);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= i.path[0] === "contentSid" ? "Template SIDs start with HX followed by 32 characters" : i.message;
      setErrors(next);
      return false;
    }
    setErrors({});
    try {
      await api.automations.update(a.id, parsed.data);
      toast(done, "success");
      onSaved();
      return true;
    } catch (e) {
      toast(errorMessage(e, "Couldn't save the automation."), "error");
      return false;
    }
  };

  const toggle = async (next: boolean) => {
    setEnabled(next);
    if (!(await save({ enabled: next }, next ? "Automation on" : "Automation paused"))) setEnabled(!next);
  };

  const commitOffset = async () => {
    const n = Number(offset);
    if (String(a.offset) === offset) return;
    if (!(await save({ offset: Number.isInteger(n) ? n : NaN }, "Timing updated"))) setOffset(String(a.offset));
  };

  const saveAdvanced = async () => {
    setSaving(true);
    await save({ body, contentSid }, "Message saved");
    setSaving(false);
  };

  let inline: ReactNode = null;
  if (s.after) {
    inline = (
      <>
        {" "}
        <input
          className="cc-inline-num"
          type="number"
          inputMode="numeric"
          min={0}
          max={1440}
          aria-label={`Number of ${s.unit}`}
          value={offset}
          disabled={!editable}
          onChange={(e) => setOffset(e.target.value)}
          onBlur={commitOffset}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />{" "}
        {s.after}
      </>
    );
  }

  return (
    <article className="cc-card p-4 md:p-5" style={{ opacity: enabled ? 1 : 0.78 }}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="cc-heading text-[17px] font-medium leading-[2.2rem] md:text-lg">
            {s.before}
            {inline}
          </p>
          <p className="cc-muted mt-1 text-sm">{s.detail}</p>
          {errors.offset && <p className="cc-error">{`Enter a whole number of ${s.unit}.`}</p>}
        </div>
        <Switch checked={enabled} onChange={toggle} label={sentence} disabled={!editable} />
      </div>
      <div className="mt-2">
        <Disclosure label="Advanced">
          <Textarea
            label="Message"
            rows={4}
            value={body}
            disabled={!editable}
            onChange={(e) => setBody(e.target.value)}
            error={errors.body}
            hint="Used for SMS, and for WhatsApp while the patient’s 24-hour window is open."
          />
          <Input
            label="WhatsApp template SID"
            placeholder="HX…"
            autoComplete="off"
            spellCheck={false}
            value={contentSid}
            disabled={!editable}
            onChange={(e) => setContentSid(e.target.value.trim())}
            error={errors.contentSid}
            hint="Meta-approved template for messages outside the 24-hour window. Without one, these go by SMS."
          />
          {editable && (
            <div>
              <Button
                variant="primary"
                loading={saving}
                disabled={body === a.body && contentSid === a.contentSid}
                onClick={saveAdvanced}
              >
                Save message
              </Button>
            </div>
          )}
        </Disclosure>
      </div>
    </article>
  );
}
