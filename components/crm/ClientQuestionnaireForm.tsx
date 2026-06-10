"use client";

import { useMemo, useState } from "react";
import { FormField } from "../ui/FormField";

export type QuestionnaireValues = {
  clientName: string;
  company: string;
  email: string;
  whatsapp: string;
  websiteUrl: string;
  industry: string;
  revenueRange: string;
  challenges: string;
  competitors: string;
  currentMarketing: string;
  toolsUsed: string;
  monthlyBudget: string;
  successGoals: string;
};

const empty: QuestionnaireValues = {
  clientName: "",
  company: "",
  email: "",
  whatsapp: "",
  websiteUrl: "",
  industry: "",
  revenueRange: "",
  challenges: "",
  competitors: "",
  currentMarketing: "",
  toolsUsed: "",
  monthlyBudget: "",
  successGoals: "",
};

export type ClientFormSubmitMeta =
  | { mode: "create"; createdBy?: string; skipResearch: boolean; jumpToStatus: string }
  | { mode: "edit"; status: string; next_action: string; assigned_to: string; changed_by: string };

type Props = {
  mode: "create" | "edit";
  initial?: Partial<QuestionnaireValues>;
  initialPipeline?: { status?: string; next_action?: string; assigned_to?: string };
  extras?: React.ReactNode;
  submitLabel: string;
  onSubmit: (values: QuestionnaireValues, meta: ClientFormSubmitMeta) => Promise<void>;
};

const industries = [
  "Healthcare",
  "Professional Services",
  "E-Commerce",
  "Real Estate",
  "Construction",
  "Education",
  "Hospitality",
  "Technology",
  "Financial Services",
  "Retail",
  "Food & Beverage",
  "Marketing",
  "Other",
];
const revenuePresets = [
  "Under R50k/month",
  "R50k - R150k/month",
  "R150k - R500k/month",
  "R500k - R1m/month",
  "Over R1m/month",
  "Other",
];
export function ClientQuestionnaireForm({ mode, initial, initialPipeline, extras, submitLabel, onSubmit }: Props) {
  const [v, setV] = useState<QuestionnaireValues>({ ...empty, ...initial });
  const [createdBy, setCreatedBy] = useState("");
  const [skipResearch, setSkipResearch] = useState(false);
  const [jumpToStatus, setJumpToStatus] = useState("");
  const [status, setStatus] = useState(initialPipeline?.status ?? "");
  const [nextAction, setNextAction] = useState(initialPipeline?.next_action ?? "");
  const [assignedTo, setAssignedTo] = useState(initialPipeline?.assigned_to ?? "");
  const [changedBy, setChangedBy] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const showExtras = mode === "create";

  const fieldsOk = useMemo(() => {
    const base =
      v.clientName.trim() &&
      v.email.includes("@") &&
      v.whatsapp.trim() &&
      v.industry.trim() &&
      v.revenueRange.trim() &&
      v.challenges.trim() &&
      v.competitors.trim() &&
      v.currentMarketing.trim() &&
      v.toolsUsed.trim() &&
      v.monthlyBudget.trim() &&
      v.successGoals.trim();
    if (mode === "edit") return base && changedBy.trim();
    return base;
  }, [v, mode, changedBy]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      if (mode === "edit") {
        await onSubmit(v, {
          mode: "edit",
          status: status || (initialPipeline?.status ?? ""),
          next_action: nextAction,
          assigned_to: assignedTo,
          changed_by: changedBy.trim() || "crm_user",
        });
      } else {
        await onSubmit(v, {
          mode: "create",
          createdBy: createdBy.trim() || undefined,
          skipResearch,
          jumpToStatus: jumpToStatus || "",
        });
      }
    } catch (er: unknown) {
      setErr(er instanceof Error ? er.message : String(er));
    } finally {
      setLoading(false);
    }
  }

  function touch(k: string) {
    setTouched((t) => ({ ...t, [k]: true }));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {extras}
      <section className="vs-card space-y-4">
        <h2 className="text-sm font-semibold text-textPrimary">Contact</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            kind="input"
            label="Client name"
            required
            value={v.clientName}
            onChange={(clientName) => setV((s) => ({ ...s, clientName }))}
            onBlur={() => touch("clientName")}
            touched={touched.clientName}
            error={!v.clientName.trim() ? "Required" : null}
          />
          {showExtras ? (
            <FormField
              kind="input"
              label="Company"
              value={v.company}
              onChange={(company) => setV((s) => ({ ...s, company }))}
            />
          ) : null}
          <FormField
            kind="input"
            label="Email"
            type="email"
            required
            value={v.email}
            onChange={(email) => setV((s) => ({ ...s, email }))}
            onBlur={() => touch("email")}
            touched={touched.email}
            error={!v.email.includes("@") ? "Valid email required" : null}
          />
          <FormField
            kind="input"
            label="WhatsApp"
            type="tel"
            required
            value={v.whatsapp}
            onChange={(whatsapp) => setV((s) => ({ ...s, whatsapp }))}
            onBlur={() => touch("whatsapp")}
            touched={touched.whatsapp}
            error={!v.whatsapp.trim() ? "Required" : null}
            hint="Include country code where possible."
          />
          <FormField
            kind="input"
            label="Website URL"
            type="url"
            value={v.websiteUrl}
            onChange={(websiteUrl) => setV((s) => ({ ...s, websiteUrl }))}
            hint="Optional — https://…"
          />
        </div>
      </section>

      <section className="vs-card space-y-4">
        <h2 className="text-sm font-semibold text-textPrimary">Business</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm text-textPrimary/90">
              Industry <span className="text-accent">*</span>
            </label>
            <select
              className="vs-input"
              value={v.industry}
              onChange={(e) => setV((s) => ({ ...s, industry: e.target.value }))}
            >
              <option value="">Select…</option>
              {industries.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="block text-sm text-textPrimary/90">
              Revenue range <span className="text-accent">*</span>
            </label>
            <select
              className="vs-input"
              value={v.revenueRange}
              onChange={(e) => setV((s) => ({ ...s, revenueRange: e.target.value }))}
            >
              <option value="">Select…</option>
              {revenuePresets.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <FormField
              kind="input"
              label="Monthly marketing budget"
              required
              value={v.monthlyBudget}
              onChange={(monthlyBudget) => setV((s) => ({ ...s, monthlyBudget }))}
              onBlur={() => touch("monthlyBudget")}
              touched={touched.monthlyBudget}
              error={!v.monthlyBudget.trim() ? "Required" : null}
              hint="e.g. 5000, 5k, or R15000"
            />
          </div>
        </div>
      </section>

      <section className="vs-card space-y-4">
        <h2 className="text-sm font-semibold text-textPrimary">Growth context</h2>
        <FormField
          kind="textarea"
          label="Challenges"
          required
          rows={4}
          value={v.challenges}
          onChange={(challenges) => setV((s) => ({ ...s, challenges }))}
          onBlur={() => touch("challenges")}
          touched={touched.challenges}
          error={!v.challenges.trim() ? "Required" : null}
        />
        <FormField
          kind="textarea"
          label="Competitors"
          required
          rows={3}
          value={v.competitors}
          onChange={(competitors) => setV((s) => ({ ...s, competitors }))}
          onBlur={() => touch("competitors")}
          touched={touched.competitors}
          error={!v.competitors.trim() ? "Required" : null}
        />
        <FormField
          kind="textarea"
          label="Current marketing"
          required
          rows={3}
          value={v.currentMarketing}
          onChange={(currentMarketing) => setV((s) => ({ ...s, currentMarketing }))}
          onBlur={() => touch("currentMarketing")}
          touched={touched.currentMarketing}
          error={!v.currentMarketing.trim() ? "Required" : null}
        />
        <FormField
          kind="textarea"
          label="Tools used"
          required
          rows={3}
          value={v.toolsUsed}
          onChange={(toolsUsed) => setV((s) => ({ ...s, toolsUsed }))}
          onBlur={() => touch("toolsUsed")}
          touched={touched.toolsUsed}
          error={!v.toolsUsed.trim() ? "Required" : null}
        />
        <FormField
          kind="textarea"
          label="Success in six months"
          required
          rows={4}
          value={v.successGoals}
          onChange={(successGoals) => setV((s) => ({ ...s, successGoals }))}
          onBlur={() => touch("successGoals")}
          touched={touched.successGoals}
          error={!v.successGoals.trim() ? "Required" : null}
        />
      </section>

      {mode === "edit" ? (
        <section className="vs-card space-y-4">
          <h2 className="text-sm font-semibold text-textPrimary">Pipeline</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm text-textPrimary/90">Status</label>
              <select className="vs-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="blueprint-submitted">blueprint-submitted</option>
                <option value="manually-added">manually-added</option>
                <option value="report-sent">report-sent</option>
                <option value="proposal-sent">proposal-sent</option>
                <option value="active-client">active-client</option>
                <option value="upsell-sent">upsell-sent</option>
                <option value="churned">churned</option>
              </select>
            </div>
            <FormField kind="input" label="Assigned to" value={assignedTo} onChange={setAssignedTo} />
            <div className="md:col-span-2">
              <FormField kind="input" label="Next action" value={nextAction} onChange={setNextAction} />
            </div>
            <div className="md:col-span-2">
              <FormField
                kind="input"
                label="Your name (audit trail)"
                required
                value={changedBy}
                onChange={setChangedBy}
                hint="Stored with each change in client_audit_log."
              />
            </div>
          </div>
        </section>
      ) : null}

      {showExtras ? (
        <section className="vs-card space-y-4">
          <h2 className="text-sm font-semibold text-textPrimary">Intake options</h2>
          <FormField
            kind="input"
            label="Recorded by (optional)"
            value={createdBy}
            onChange={setCreatedBy}
            hint="Stored on the client record as created_by."
          />
          <label className="flex items-center gap-2 text-sm text-textPrimary/90">
            <input type="checkbox" checked={skipResearch} onChange={(e) => setSkipResearch(e.target.checked)} className="rounded border-white/20" />
            Skip research task (known client)
          </label>
          <div className="space-y-2">
            <label className="block text-sm text-textPrimary/90">Jump to stage (optional)</label>
            <select
              className="vs-input max-w-md"
              value={jumpToStatus}
              onChange={(e) => setJumpToStatus(e.target.value)}
            >
              <option value="">Default (manually-added + research task)</option>
              <option value="proposal-sent">Proposal sent</option>
              <option value="active-client">Active client</option>
              <option value="report-sent">Report sent</option>
            </select>
          </div>
        </section>
      ) : null}

      {err ? <p className="text-sm text-rose-300">{err}</p> : null}

      <button
        type="submit"
        disabled={loading || !fieldsOk}
        className="vs-button-primary disabled:opacity-40 disabled:pointer-events-none"
      >
        {loading ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
