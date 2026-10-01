"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { api } from "../../../lib/consultant/client/api";
import { formatZar } from "../../../lib/consultant/client/format";
import { GOAL_METRICS, GoalInput, type Goal, type GoalMetric } from "../../../lib/consultant/types";
import { INPUT_CLASS } from "../MicField";
import { Sheet } from "../Sheet";
import { Button } from "../ui";
import { cx, describeError, errorFields, FOCUS } from "../utils";
import { useUpload } from "../../../hooks/consultant/useUpload";
import { IMAGE_TYPES } from "../wave2/data";
import { SastDateTimeField, sastDateKey } from "../wave2/SastDateTime";
import { isMoneyMetric, METRIC_LABELS } from "./GoalCard";

type Form = { title: string; why: string; targetDate: string; metric: GoalMetric; targetValue: string };

function blank(): Form {
  return { title: "", why: "", targetDate: sastDateKey(90), metric: "commission", targetValue: "" };
}

function fromGoal(g: Goal): Form {
  return { title: g.title, why: g.why, targetDate: g.targetDate, metric: g.metric, targetValue: String(g.targetValue) };
}

/**
 * Create / edit a Why Board goal. The prompts lead with the personal reason
 * (Fogg: motivation), then the measurable target the calculator can plan for.
 */
export function GoalSheet({
  open,
  goal,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  goal: Goal | null; // null = new
  onClose: () => void;
  onSaved: (g: Goal) => void;
  onDeleted: (id: string) => void;
}) {
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const up = useUpload();
  const [form, setForm] = useState<Form>(blank);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(goal ? fromGoal(goal) : blank());
    setFile(null);
    setRemoveImage(false);
    setFields({});
    setError(null);
    setConfirmDelete(false);
  }, [open, goal]);

  // Local preview for a picked image; revoked when it changes.
  useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setError(null);
    const draft = {
      title: form.title,
      why: form.why,
      targetDate: form.targetDate,
      metric: form.metric,
      targetValue: Number(form.targetValue),
    };
    const check = GoalInput.safeParse(draft);
    if (!check.success) {
      const f: Record<string, string> = {};
      for (const i of check.error.issues) f[String(i.path[0])] ??= i.message;
      if (f.targetValue) f.targetValue = "Enter a target above zero.";
      if (f.title) f.title = "Give the goal a name.";
      setFields(f);
      return;
    }
    if (form.targetDate < sastDateKey(0)) {
      setFields({ targetDate: "Pick a date from today onwards." });
      return;
    }
    setFields({});
    setSaving(true);
    try {
      let imagePath: string | undefined;
      if (file) {
        const path = await up.upload(file, "goal_image");
        if (!path) return; // cancelled
        imagePath = path;
      }
      const saved = goal
        ? await api.goals.patch(goal.id, { ...check.data, ...(imagePath ? { imagePath } : removeImage ? { imagePath: null } : {}) })
        : await api.goals.create({ ...check.data, ...(imagePath ? { imagePath } : {}) });
      onSaved(saved);
    } catch (e) {
      const f = errorFields(e);
      if (f) setFields(f);
      setError(describeError(e, "save"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!goal) return;
    setSaving(true);
    setError(null);
    try {
      await api.goals.remove(goal.id);
      onDeleted(goal.id);
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setSaving(false);
    }
  };

  const shownImage = preview ?? (!removeImage ? goal?.imageUrl ?? null : null);
  const money = isMoneyMetric(form.metric);

  return (
    <Sheet
      open={open}
      title={goal ? "Edit goal" : "New goal"}
      onClose={onClose}
      footer={
        <div className="space-y-2">
          <div aria-live="assertive">
            {error && (
              <p role="alert" className="text-sm text-[--cp-risk]">
                {error}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {goal &&
              (confirmDelete ? (
                <Button variant="danger" size="lg" disabled={saving} onClick={() => void remove()}>
                  Delete goal
                </Button>
              ) : (
                <Button variant="ghost" size="lg" disabled={saving} onClick={() => setConfirmDelete(true)} aria-label="Delete goal">
                  <Trash2 size={18} aria-hidden />
                </Button>
              ))}
            <Button variant="primary" size="lg" className="flex-1" disabled={saving} onClick={() => void save()}>
              {up.uploading ? `Uploading… ${Math.round(up.progress * 100)}%` : saving ? "Saving…" : goal ? "Save goal" : "Add to my Why Board"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={`${ids}-title`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            What are you working toward?
          </label>
          <input
            id={`${ids}-title`}
            value={form.title}
            maxLength={120}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Deposit on our first home"
            aria-invalid={!!fields.title}
            className={cx(INPUT_CLASS, fields.title ? "border-[--cp-risk]" : "border-[--cp-border]")}
          />
          {fields.title && <p className="mt-1 text-sm text-[--cp-risk]">{fields.title}</p>}
        </div>
        <div>
          <label htmlFor={`${ids}-why`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
            Why does it matter to you?
          </label>
          <textarea
            id={`${ids}-why`}
            rows={3}
            maxLength={1000}
            value={form.why}
            onChange={(e) => set("why", e.target.value)}
            placeholder="So the kids grow up with a garden."
            className={cx(INPUT_CLASS, "border-[--cp-border] py-2")}
          />
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-[--cp-text]">Picture (optional)</p>
          <div className="flex items-center gap-3">
            <div className="relative aspect-[16/9] w-32 shrink-0 overflow-hidden rounded-xl bg-[--cp-surface-2]">
              {shownImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownImage} alt="" className="absolute inset-0 h-full w-full object-cover" />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <input
                ref={fileRef}
                id={`${ids}-img`}
                type="file"
                accept={IMAGE_TYPES.join(",")}
                className="sr-only"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setRemoveImage(false);
                }}
              />
              <label htmlFor={`${ids}-img`} className={cx("inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[--cp-accent-text]", FOCUS)}>
                <ImagePlus size={16} aria-hidden /> {shownImage ? "Change picture" : "Add a picture"}
              </label>
              {shownImage && (
                <button
                  type="button"
                  className={cx("min-h-11 text-left text-sm text-[--cp-muted] hover:text-[--cp-text]", FOCUS)}
                  onClick={() => {
                    setFile(null);
                    setRemoveImage(true);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                >
                  Remove picture
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-[--cp-muted]">Private — only you and your managers can see it.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${ids}-metric`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
              Measure it by
            </label>
            <select
              id={`${ids}-metric`}
              value={form.metric}
              onChange={(e) => set("metric", e.target.value as GoalMetric)}
              className={cx(INPUT_CLASS, "border-[--cp-border]")}
            >
              {GOAL_METRICS.map((m) => (
                <option key={m} value={m}>
                  {METRIC_LABELS[m]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${ids}-target`} className="mb-1.5 block text-sm font-medium text-[--cp-text]">
              Target {money ? "(R)" : ""}
            </label>
            <input
              id={`${ids}-target`}
              inputMode="numeric"
              value={form.targetValue}
              onChange={(e) => set("targetValue", e.target.value.replace(/[^\d]/g, ""))}
              aria-invalid={!!fields.targetValue}
              className={cx(INPUT_CLASS, fields.targetValue ? "border-[--cp-risk]" : "border-[--cp-border]")}
            />
            {fields.targetValue ? (
              <p className="mt-1 text-sm text-[--cp-risk]">{fields.targetValue}</p>
            ) : (
              money && form.targetValue && <p className="mt-1 text-xs text-[--cp-muted]">{formatZar(Number(form.targetValue))}</p>
            )}
          </div>
        </div>
        <SastDateTimeField
          label="Target date"
          showTime={false}
          value={{ date: form.targetDate, time: "" }}
          minDate={sastDateKey(0)}
          onChange={(v) => set("targetDate", v.date)}
          error={fields.targetDate}
        />
      </div>
    </Sheet>
  );
}
