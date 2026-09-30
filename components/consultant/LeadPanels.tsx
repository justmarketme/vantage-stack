"use client";

import { useEffect, useId, useState } from "react";
import { CalendarClock, Globe, Mail, MapPin, Phone } from "lucide-react";
import { SALES_STAGES, SALES_STAGE_LABELS, type Lead, type LeadPatch, type SalesStage } from "../../lib/consultant/types";
import { CallButton } from "./CallButton";
import { ClaimButton } from "./ClaimButton";
import { HealthDot } from "./HealthDot";
import { INPUT_CLASS } from "./MicField";
import { Button, SURFACE } from "./ui";
import { cx, fmtDue, fmtZar, FOCUS, fromLocalInput, toLocalInput } from "./utils";

/** Lead workspace header: who, how to reach them, stage, health, and the big Call button. */
export function LeadHeader({
  lead,
  readOnly,
  canClaim,
  onPatch,
}: {
  lead: Lead;
  readOnly: boolean;
  canClaim: boolean;
  onPatch: (p: LeadPatch) => void;
}) {
  const stageId = useId();
  const [lostReason, setLostReason] = useState(lead.lostReason ?? "");
  const [value, setValue] = useState(lead.dealValue != null ? String(lead.dealValue) : "");
  useEffect(() => setLostReason(lead.lostReason ?? ""), [lead.lostReason]);
  useEffect(() => setValue(lead.dealValue != null ? String(lead.dealValue) : ""), [lead.dealValue]);

  const unassigned = !lead.consultantId;
  const website = lead.website?.replace(/^https?:\/\//, "").replace(/\/$/, "");

  return (
    <section className={cx(SURFACE, "p-4 md:p-5")} aria-labelledby="lead-title">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 id="lead-title" className="font-heading text-2xl font-medium leading-tight text-[--cp-text]">
            {lead.clinicName}
          </h1>
          <p className="mt-1 text-sm text-[--cp-muted]">
            {[lead.contactName, lead.contactRole].filter(Boolean).join(" · ") || "No contact yet"}
          </p>
        </div>
        <HealthDot health={lead.health} className="mt-2 shrink-0" />
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {lead.phone && (
          <li className="inline-flex items-center gap-1.5 text-[--cp-muted]">
            <Phone size={14} aria-hidden /> <span className="text-[--cp-text]">{lead.phone}</span>
          </li>
        )}
        {lead.email && (
          <li>
            <a href={`mailto:${lead.email}`} className={cx("inline-flex min-h-11 items-center gap-1.5 text-[--cp-accent-text] underline-offset-2 hover:underline", FOCUS)}>
              <Mail size={14} aria-hidden /> {lead.email}
            </a>
          </li>
        )}
        {lead.website && (
          <li>
            <a href={lead.website} target="_blank" rel="noopener noreferrer" className={cx("inline-flex min-h-11 items-center gap-1.5 text-[--cp-accent-text] underline-offset-2 hover:underline", FOCUS)}>
              <Globe size={14} aria-hidden /> {website}
            </a>
          </li>
        )}
        {lead.city && (
          <li className="inline-flex items-center gap-1.5 text-[--cp-muted]">
            <MapPin size={14} aria-hidden /> {lead.city}
          </li>
        )}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={stageId} className="mb-1.5 block text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">
            Stage
          </label>
          <select
            id={stageId}
            value={lead.salesStage}
            disabled={readOnly}
            onChange={(e) => onPatch({ salesStage: e.target.value as SalesStage })}
            className={cx(INPUT_CLASS, "border-[--cp-border]", lead.salesStage === "won" && "text-[--cp-progress]")}
          >
            {SALES_STAGES.map((s) => (
              <option key={s} value={s}>
                {SALES_STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <p className="self-end text-sm text-[--cp-muted]">
          Owner: <span className="text-[--cp-text]">{lead.consultantName ?? "Unassigned"}</span>
          <br />
          {lead.callCount} {lead.callCount === 1 ? "call" : "calls"}
        </p>
      </div>

      {(lead.salesStage === "proposal" || lead.salesStage === "won") && (
        <div className="mt-3">
          <label htmlFor={`${stageId}-value`} className="mb-1.5 block text-sm text-[--cp-text]">
            Monthly value (ZAR)
          </label>
          <input
            id={`${stageId}-value`}
            inputMode="numeric"
            value={value}
            disabled={readOnly}
            onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={() => {
              const n = value ? Number(value) : null;
              if (n !== lead.dealValue) onPatch({ dealValue: n });
            }}
            placeholder="e.g. 4500"
            className={cx(INPUT_CLASS, "border-[--cp-border]")}
          />
          {lead.dealValue != null && <p className="mt-1 text-xs text-[--cp-muted]">{fmtZar(lead.dealValue)} per month</p>}
        </div>
      )}

      {lead.salesStage === "lost" && (
        <div className="mt-3">
          <label htmlFor={`${stageId}-lost`} className="mb-1.5 block text-sm text-[--cp-text]">
            Why was it lost?
          </label>
          <input
            id={`${stageId}-lost`}
            value={lostReason}
            disabled={readOnly}
            onChange={(e) => setLostReason(e.target.value)}
            onBlur={() => {
              if (lostReason.trim() !== (lead.lostReason ?? "")) onPatch({ lostReason: lostReason.trim() || null });
            }}
            className={cx(INPUT_CLASS, "border-[--cp-border]")}
          />
        </div>
      )}

      <div className="mt-5">
        {unassigned && canClaim ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-[--cp-surface-2] p-3">
            <p className="text-sm text-[--cp-muted]">In the unassigned pool. Claim it to call and edit.</p>
            <ClaimButton lead={lead} />
          </div>
        ) : (
          <CallButton lead={lead} size="xl" showReason />
        )}
      </div>
    </section>
  );
}

/** The single next action, editable in place. */
export function NextActionCard({ lead, readOnly, onPatch }: { lead: Lead; readOnly: boolean; onPatch: (p: LeadPatch) => void }) {
  const [editing, setEditing] = useState(false);
  const [what, setWhat] = useState(lead.nextAction ?? "");
  const [when, setWhen] = useState(toLocalInput(lead.nextActionAt));
  const id = useId();
  const due = fmtDue(lead.nextActionAt);

  const open = () => {
    setWhat(lead.nextAction ?? "");
    setWhen(toLocalInput(lead.nextActionAt));
    setEditing(true);
  };
  const save = () => {
    onPatch({ nextAction: what.trim() || null, nextActionAt: fromLocalInput(when) });
    setEditing(false);
  };

  return (
    <section className={cx(SURFACE, "p-4")} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`} className="text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">
        Next action
      </h2>
      {editing ? (
        <div className="mt-2 space-y-2">
          <label htmlFor={`${id}-what`} className="sr-only">
            What
          </label>
          <input id={`${id}-what`} value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Call back with pricing" className={cx(INPUT_CLASS, "border-[--cp-border]")} />
          <label htmlFor={`${id}-when`} className="sr-only">
            When
          </label>
          <input id={`${id}-when`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cx(INPUT_CLASS, "border-[--cp-border] [color-scheme:dark]")} />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="min-w-0 text-base text-[--cp-text]">
            {lead.nextAction || (lead.nextActionAt ? "Follow up" : <span className="text-[--cp-muted]">Nothing scheduled</span>)}
            {due && (
              <span className={cx("mt-0.5 flex items-center gap-1 text-sm", due.overdue ? "text-[--cp-objection]" : "text-[--cp-muted]")}>
                <CalendarClock size={14} aria-hidden /> {due.label}
              </span>
            )}
          </p>
          {!readOnly && (
            <Button variant="secondary" onClick={open}>
              {lead.nextAction || lead.nextActionAt ? "Change" : "Set"}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
