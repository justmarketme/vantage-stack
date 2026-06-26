"use client";

// Track 3/Glue (layer 1) — the guided, one-step-at-a-time blueprint deck.
// Renders the schema-driven XState machine (Track B) as a deck: the current
// step's visible fields, generated from the form-schema descriptor, with
// progress, validation, and Next/Prev/Submit wired to machine events.
//
// Schema-selectable (quick | detailed) per Jonathan's decision — the same
// engine drives both. Isabel's voice layer (client tools) and the intro
// choreography bind to this via the machine's emitted events (added next).

import { useEffect, useMemo, useRef, useState } from "react";
import { useActor } from "@xstate/react";
import { createFormMachine } from "../../lib/blueprint/form-machine";
import {
  FORM_SCHEMAS,
  asArray,
  asString,
  type FieldDef,
  type OptionDef,
  type FormData,
} from "../../lib/blueprint/form-schema";
import { BLUEPRINT_TOOL_EVENT, type BlueprintToolDetail } from "../../lib/blueprint/voice-tools";
import { ProgressBar } from "../ui/ProgressBar";

const CAL_LINK = "https://cal.com/vantagestack/discovery-call";

const optValue = (o: OptionDef) => (typeof o === "string" ? o : o.value);
const optLabel = (o: OptionDef) => (typeof o === "string" ? o : o.label);

function fieldOptions(field: FieldDef, data: FormData): OptionDef[] {
  if (field.options) return field.options;
  if (field.getOptions) return field.getOptions(data);
  return [];
}

export function GuidedBlueprint({ schemaId = "quick" }: { schemaId?: "quick" | "detailed" }) {
  const schema = FORM_SCHEMAS[schemaId];
  const machine = useMemo(() => createFormMachine(schema), [schema]);
  const [snapshot, send] = useActor(machine, { input: {} });

  // Begin the flow once mounted.
  useEffect(() => {
    send({ type: "START" });
  }, [send]);

  const { stepIndex, data, errors, submitError, result } = snapshot.context;
  const step = schema.steps[stepIndex];
  const isLast = stepIndex === schema.steps.length - 1;
  const submitting = snapshot.matches("submitting");
  const progress = Math.round(((stepIndex + 1) / schema.steps.length) * 100);

  // ── Layer 3 glue: Isabel's client tools (voice) drive the machine + UI ──
  const [highlightedField, setHighlightedField] = useState<string | null>(null);
  const fieldByKey = useMemo(() => {
    const map: Record<string, FieldDef> = {};
    schema.steps.forEach((s) => s.fields.forEach((f) => (map[f.key] = f)));
    return map;
  }, [schema]);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const scrollToField = (key: string) =>
      requestAnimationFrame(() =>
        document.querySelector(`[data-field="${key}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
    function onTool(e: Event) {
      const d = (e as CustomEvent<BlueprintToolDetail>).detail;
      switch (d.tool) {
        case "highlight":
          setHighlightedField(d.fieldId);
          scrollToField(d.fieldId);
          break;
        case "set": {
          const f = fieldByKey[d.fieldId];
          if (f?.kind === "multi") send({ type: "TOGGLE_MULTI", key: d.fieldId, value: d.value, maxItems: f.maxItems });
          else send({ type: "SET_FIELD", key: d.fieldId, value: d.value });
          setHighlightedField(d.fieldId);
          break;
        }
        case "advance":
          send({ type: "NEXT" });
          break;
        case "previous":
          send({ type: "PREV" });
          break;
        case "submit":
          send({ type: "SUBMIT" });
          break;
        case "openCalendar": {
          const name = encodeURIComponent(asString(dataRef.current.clientName));
          const email = encodeURIComponent(asString(dataRef.current.email));
          window.open(`${CAL_LINK}?name=${name}&email=${email}`, "_blank", "noopener");
          break;
        }
        case "showConsent":
          setHighlightedField("whatsappConsent");
          scrollToField("whatsappConsent");
          break;
      }
    }
    window.addEventListener(BLUEPRINT_TOOL_EVENT, onTool as EventListener);
    return () => window.removeEventListener(BLUEPRINT_TOOL_EVENT, onTool as EventListener);
  }, [send, fieldByKey]);

  if (snapshot.matches("submitted")) {
    return (
      <div className="vs-card">
        <div className="space-y-3">
          <p className="vs-section-heading">Blueprint submitted</p>
          <h2 className="font-heading text-2xl md:text-3xl">You&apos;re in.</h2>
          <p className="max-w-2xl text-sm text-textMuted">
            We&apos;ll review your answers and send a tailored breakdown within 1 business day — based on your specific
            situation, not a generic template.
          </p>
          {result?.clientId && <p className="text-xs text-textMuted/60">Reference: {result.clientId}</p>}
        </div>
      </div>
    );
  }

  if (!step) return null;
  const visibleFields = step.fields.filter((f) => !f.visibleWhen || f.visibleWhen(data));

  return (
    <div className="vs-card" data-step-id={step.id}>
      <div className="mb-6 space-y-2">
        <p className="vs-section-heading">{step.label(data)}</p>
        {step.intro && <p className="text-sm italic text-textMuted/80">{step.intro(data)}</p>}
      </div>

      <div className="mb-8">
        <ProgressBar value={progress} label={`Step ${stepIndex + 1} of ${schema.steps.length}`} />
      </div>

      <div className="space-y-6">
        {visibleFields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            data={data}
            error={errors[field.key]}
            highlighted={highlightedField === field.key}
            onSet={(value) => send({ type: "SET_FIELD", key: field.key, value })}
            onToggle={(value) => send({ type: "TOGGLE_MULTI", key: field.key, value, maxItems: field.maxItems })}
          />
        ))}
      </div>

      {submitError && <p className="mt-4 text-sm text-rose-300">{submitError}</p>}

      <div className="mt-8 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => send({ type: "PREV" })}
          disabled={stepIndex === 0 || submitting}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm text-textMuted transition hover:text-textPrimary disabled:cursor-not-allowed disabled:opacity-30"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={() => send({ type: "SUBMIT" })}
            disabled={submitting}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit blueprint"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => send({ type: "NEXT" })}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Continue
          </button>
        )}
      </div>
    </div>
  );
}

function FieldRenderer({
  field,
  data,
  error,
  highlighted,
  onSet,
  onToggle,
}: {
  field: FieldDef;
  data: FormData;
  error?: string;
  highlighted?: boolean;
  onSet: (value: string) => void;
  onToggle: (value: string) => void;
}) {
  const options = fieldOptions(field, data);
  const value = data[field.key];
  // Prominent, premium "Isabel is pointing here" highlight — a bright accent
  // ring + outward glow + faint tint, drawn with box-shadow so it never shifts
  // layout. This is the on-screen cue she refers to ("see this lighting up?").
  const ring = highlighted
    ? "rounded-xl bg-accent/[0.06] shadow-[0_0_0_2px_rgba(56,189,248,0.9),0_0_34px_8px_rgba(56,189,248,0.32)] transition-all duration-300"
    : "rounded-xl transition-all duration-300";
  const labelEl = (
    <label className="block text-sm text-textPrimary/90" id={`label-${field.key}`}>
      {field.label}
      {field.hint && <span className="ml-1 text-xs text-textMuted/60">{field.hint}</span>}
    </label>
  );
  const errEl = error ? <p className="text-xs text-rose-300">{error}</p> : null;

  if (field.kind === "checkbox") {
    const checked = asString(value) === "true";
    return (
      <div className={`space-y-2 p-3 ${ring}`} data-field={field.key}>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-textPrimary/90">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onSet(e.target.checked ? "true" : "")}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span>{field.label}</span>
        </label>
        {errEl}
      </div>
    );
  }

  switch (field.kind) {
    case "select":
      return (
        <div className={`space-y-2 ${ring}`} data-field={field.key}>
          {labelEl}
          <select className="vs-input" value={asString(value)} onChange={(e) => onSet(e.target.value)}>
            <option value="">Select an option</option>
            {options.map((o) => (
              <option key={optValue(o)} value={optValue(o)}>
                {optLabel(o)}
              </option>
            ))}
          </select>
          {errEl}
        </div>
      );
    case "cards":
      return (
        <div className={`space-y-2 ${ring}`} data-field={field.key}>
          {labelEl}
          <div className="grid gap-2">
            {options.map((o) => {
              const v = optValue(o);
              const selected = asString(value) === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onSet(selected ? "" : v)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                    selected
                      ? "border-accent/60 bg-accent/10 text-textPrimary"
                      : "border-white/10 text-textMuted hover:border-white/20 hover:text-textPrimary"
                  }`}
                >
                  {optLabel(o)}
                </button>
              );
            })}
          </div>
          {errEl}
        </div>
      );
    case "multi":
      return (
        <div className={`space-y-2 ${ring}`} data-field={field.key}>
          {labelEl}
          <div className="grid gap-2">
            {options.map((o) => {
              const v = optValue(o);
              const arr = asArray(value);
              const selected = arr.includes(v);
              const capped = !selected && field.maxItems !== undefined && arr.length >= field.maxItems;
              return (
                <button
                  key={v}
                  type="button"
                  disabled={capped}
                  onClick={() => onToggle(v)}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                    selected
                      ? "border-accent/60 bg-accent/10 text-textPrimary"
                      : "border-white/10 text-textMuted hover:border-white/20 hover:text-textPrimary"
                  } ${capped ? "cursor-not-allowed opacity-40" : ""}`}
                >
                  {optLabel(o)}
                </button>
              );
            })}
          </div>
          {errEl}
        </div>
      );
    case "textarea":
      return (
        <div className={`space-y-2 ${ring}`} data-field={field.key}>
          {labelEl}
          <textarea
            className="vs-input min-h-[90px]"
            value={asString(value)}
            onChange={(e) => onSet(e.target.value)}
          />
          {errEl}
        </div>
      );
    default:
      return (
        <div className={`space-y-2 ${ring}`} data-field={field.key}>
          {labelEl}
          <input
            className="vs-input"
            type={field.kind === "email" ? "email" : field.kind === "tel" ? "tel" : field.kind === "url" ? "url" : "text"}
            value={asString(value)}
            onChange={(e) => onSet(e.target.value)}
          />
          {errEl}
        </div>
      );
  }
}
