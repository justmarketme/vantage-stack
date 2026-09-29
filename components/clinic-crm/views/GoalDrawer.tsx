"use client";

import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { GOAL_METRICS, type Goal, type GoalMetric } from "@/lib/clinic-crm/types";
import { Button } from "../ui/Button";
import { Disclosure } from "../ui/Disclosure";
import { Drawer } from "../ui/Drawer";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { METRIC } from "./format";

export type GoalColor = Goal["color"];
export const GOAL_COLORS: readonly GoalColor[] = ["blue", "amber", "green", "rose", "violet"];

export interface GoalFields {
  title: string;
  metric: GoalMetric;
  target: number | null;
  progress: number | null;
  dueOn: string | null;
  color: GoalColor;
}

const num = (v: string) => (v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/** Create (goal = null) or edit a sticky note's contents; position is owned by the board. */
export function GoalDrawer({
  open,
  goal,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  goal: Goal | null;
  onClose: () => void;
  onSave: (fields: GoalFields) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  return (
    <Drawer open={open} onClose={onClose} title={goal ? "Edit goal" : "New goal"}>
      {open && <GoalForm key={goal?.id ?? "new"} goal={goal} onSave={onSave} onDelete={onDelete} onCancel={onClose} />}
    </Drawer>
  );
}

function GoalForm({
  goal,
  onSave,
  onDelete,
  onCancel,
}: {
  goal: Goal | null;
  onSave: (fields: GoalFields) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(goal?.title ?? "");
  const [metric, setMetric] = useState<GoalMetric>(goal?.metric ?? "custom");
  const [target, setTarget] = useState(goal?.target?.toString() ?? "");
  const [progress, setProgress] = useState(goal?.progress?.toString() ?? "");
  const [dueOn, setDueOn] = useState(goal?.dueOn ?? "");
  const [color, setColor] = useState<GoalColor>(goal?.color ?? "blue");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "delete" | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Give the goal a title");
      return;
    }
    setPending("save");
    try {
      await onSave({ title: title.trim(), metric, target: num(target), progress: num(progress), dueOn: dueOn || null, color });
    } finally {
      setPending(null);
    }
  };

  const unit = METRIC[metric].unit;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Input label="Goal" placeholder="e.g. Halve our no-shows" value={title} onChange={(e) => setTitle(e.target.value)} error={error} data-autofocus />
      <Select
        label="Measured by"
        value={metric}
        onChange={(e) => setMetric(e.target.value as GoalMetric)}
        options={GOAL_METRICS.map((m) => ({ value: m, label: METRIC[m].label }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input label={`Target${unit ? ` (${unit})` : ""}`} type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        <Input label={`Current${unit ? ` (${unit})` : ""}`} type="number" inputMode="decimal" value={progress} onChange={(e) => setProgress(e.target.value)} />
      </div>
      <Input label="Due" type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
      <fieldset>
        <legend className="cc-label">Colour</legend>
        <div role="radiogroup" aria-label="Colour" className="flex gap-3">
          {GOAL_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={c === color}
              aria-label={c}
              className="cc-swatch"
              style={{ background: `var(--cc-note-${c})` }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </fieldset>
      <div className="flex gap-2 pt-2">
        <Button type="submit" variant="primary" loading={pending === "save"}>
          {goal ? "Save goal" : "Pin to board"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      {goal && onDelete && (
        <div className="cc-divider pt-2">
          <Disclosure>
            <div>
              <Button
                variant="danger"
                loading={pending === "delete"}
                icon={<Trash2 size={18} aria-hidden />}
                onClick={async () => {
                  setPending("delete");
                  try {
                    await onDelete();
                  } finally {
                    setPending(null);
                  }
                }}
              >
                Remove from board
              </Button>
            </div>
          </Disclosure>
        </div>
      )}
    </form>
  );
}
