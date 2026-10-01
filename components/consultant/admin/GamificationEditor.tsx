"use client";

import { useEffect, useId, useState } from "react";
import { useGamificationSettings } from "../../../hooks/consultant/useGamificationSettings";
import { formatZar } from "../../../lib/consultant/client/format";
import { GamificationSettings } from "../../../lib/consultant/types";
import { INPUT_CLASS } from "../MicField";
import { Button, Skeleton, SURFACE } from "../ui";
import { cx, describeError } from "../utils";
import { LoadError } from "../wave2/parts";

type Settings = GamificationSettings;
type PointsKey = keyof Settings["points"];

const POINT_LABELS: Record<PointsKey, string> = {
  dial: "Dial",
  connect: "Answered call",
  meetingBooked: "Meeting booked",
  meetingHeld: "Meeting held",
  proposal: "Proposal",
  won: "Won",
  paid: "Paid",
};

/** Read a dotted path's zod error for a field (e.g. "tier1.monthlyRevenue"). */
function issuesByPath(s: unknown): Record<string, string> {
  const r = GamificationSettings.safeParse(s);
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) out[i.path.join(".")] ??= i.message;
  return out;
}

/**
 * Gamification settings (Acquisition & Creative Direction). Thresholds are
 * data, not code; validated with the same `GamificationSettings` schema the
 * API uses. Read-only for roles without `manage_gamification`.
 */
export function GamificationEditor({ canEdit }: { canEdit: boolean }) {
  const settings = useGamificationSettings();
  const ids = useId();
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  if (settings.loading) return <Skeleton className="h-[520px] rounded-2xl" />;
  if (settings.error && !settings.data) return <LoadError error={settings.error} onRetry={() => void settings.refresh()} />;
  if (!draft) return null;

  const errors = issuesByPath(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings.data);

  const intIn = (v: string) => (v === "" ? 0 : Math.max(0, Math.floor(Number(v.replace(/[^\d]/g, "")) || 0)));
  /** Apply an edit to a copy of the draft (never mutate React state in place). */
  const upd = (fn: (d: Settings) => void) => {
    setStatus(null);
    setDraft((d) => {
      if (!d) return d;
      const next = structuredClone(d);
      fn(next);
      return next;
    });
  };

  const save = async () => {
    const r = GamificationSettings.safeParse(draft);
    if (!r.success) return setError("Fix the highlighted fields first.");
    setSaving(true);
    setError(null);
    try {
      const saved = await settings.save(r.data);
      setDraft(saved);
      setStatus("Saved. The leaderboard uses the new numbers now.");
    } catch (e) {
      setError(describeError(e, "save"));
    } finally {
      setSaving(false);
    }
  };

  const field = (
    path: string,
    label: string,
    value: string | number,
    onChange: (v: string) => void,
    opts: { money?: boolean; text?: boolean; suffix?: string } = {},
  ) => (
    <div>
      <label htmlFor={`${ids}-${path}`} className="mb-1.5 block text-sm text-[--cp-text]">
        {label}
      </label>
      <div className="relative">
        <input
          id={`${ids}-${path}`}
          inputMode={opts.text ? undefined : "numeric"}
          value={value}
          disabled={!canEdit}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={!!errors[path]}
          className={cx(INPUT_CLASS, errors[path] ? "border-[--cp-risk]" : "border-[--cp-border]", opts.suffix && "pr-10", !opts.text && "tabular-nums")}
        />
        {opts.suffix && <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[--cp-muted]">{opts.suffix}</span>}
      </div>
      {errors[path] ? (
        <p className="mt-1 text-sm text-[--cp-risk]">{errors[path]}</p>
      ) : (
        opts.money && typeof value === "number" && <p className="mt-1 text-xs text-[--cp-muted]">{formatZar(value)}</p>
      )}
    </div>
  );

  return (
    <div className={cx(SURFACE, "space-y-6 p-4 md:p-5")}>
      {!canEdit && <p className="text-sm text-[--cp-muted]">View only — changing these needs the “manage gamification” permission.</p>}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 font-heading text-base text-[--cp-text]">Targets</legend>
        {field("quarterTarget", "Quarterly target (R, per consultant)", draft.quarterTarget, (v) => upd((d) => { d.quarterTarget = intIn(v); }), { money: true })}
        {field(
          "closeTargetFromConnects",
          "Close target (paid ÷ answered)",
          Math.round(draft.closeTargetFromConnects * 1000) / 10,
          (v) => upd((d) => { d.closeTargetFromConnects = Math.min(1, Math.max(0, Number(v.replace(/[^\d.]/g, "")) / 100 || 0)); }),
          { suffix: "%" },
        )}
      </fieldset>

      {(["tier1", "tier2"] as const).map((t, i) => (
        <fieldset key={t} className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 font-heading text-base text-[--cp-text]">Tier {i + 1} · monthly</legend>
          {field(`${t}.label`, "Name", draft[t].label, (v) => upd((d) => { d[t].label = v.slice(0, 60); }), { text: true })}
          {field(`${t}.monthlyRevenue`, "Paid revenue in a month (R)", draft[t].monthlyRevenue, (v) => upd((d) => { d[t].monthlyRevenue = intIn(v); }), { money: true })}
          {field(`${t}.reward`, "Reward", draft[t].reward, (v) => upd((d) => { d[t].reward = v.slice(0, 80); }), { text: true })}
        </fieldset>
      ))}

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 font-heading text-base text-[--cp-text]">Tier 3 · quarterly</legend>
        {field("tier3.label", "Name", draft.tier3.label, (v) => upd((d) => { d.tier3.label = v.slice(0, 60); }), { text: true })}
        {field("tier3.topN", "Top N consultants", draft.tier3.topN, (v) => upd((d) => { d.tier3.topN = intIn(v); }))}
        {field("tier3.minQuarterRevenue", "Minimum quarter revenue (R)", draft.tier3.minQuarterRevenue, (v) => upd((d) => { d.tier3.minQuarterRevenue = intIn(v); }), { money: true })}
        {field("tier3.reward", "Reward", draft.tier3.reward, (v) => upd((d) => { d.tier3.reward = v.slice(0, 80); }), { text: true })}
      </fieldset>

      <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <legend className="mb-2 font-heading text-base text-[--cp-text]">Points per action</legend>
        {(Object.keys(POINT_LABELS) as PointsKey[]).map((k) => (
          <div key={k}>{field(`points.${k}`, POINT_LABELS[k], draft.points[k], (v) => upd((d) => { d.points[k] = intIn(v); }))}</div>
        ))}
      </fieldset>

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[--cp-border] pt-4">
          <Button variant="primary" size="lg" disabled={!dirty || saving || Object.keys(errors).length > 0} onClick={() => void save()}>
            {saving ? "Saving…" : "Save settings"}
          </Button>
          {dirty && (
            <Button variant="ghost" size="lg" disabled={saving} onClick={() => settings.data && setDraft(settings.data)}>
              Discard changes
            </Button>
          )}
          <p aria-live="polite" className={cx("text-sm", error ? "text-[--cp-risk]" : "text-[--cp-progress]")}>
            {error ?? status}
          </p>
        </div>
      )}
    </div>
  );
}
