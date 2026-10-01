"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import { formatZar } from "../../../lib/consultant/client/format";
import { calculate } from "../../../lib/consultant/metrics/calculator";
// Pure SAST + SA-public-holiday maths (no server-only imports) — safe in the browser.
import { workingDaysUntil } from "../../../lib/consultant/server/workingDays";
import { CalculatorInput, type CalculatorResult, type FunnelMetrics, type Goal } from "../../../lib/consultant/types";
import { INPUT_CLASS } from "../MicField";
import { Button, SURFACE } from "../ui";
import { cx } from "../utils";
import { num } from "../wave2/parts";
import { SastDateTimeField, sastDateKey } from "../wave2/SastDateTime";

type GoalType = CalculatorInput["goalType"];
const GOAL_LABELS: Record<GoalType, string> = { commission: "Commission (R)", revenue: "Revenue paid (R)", deals: "Paid deals" };

/*
 * Last-resort fallbacks, used only if the metrics response carries no
 * `defaults` (the server sends cfg.metrics.default* / cfg.commission.rate there).
 */
const FALLBACK = { avgSale: 15000, connectRate: 0.3, commissionRate: 0.25 };

/** Server defaults first, then the local fallback. */
function defaultsOf(m: FunnelMetrics | undefined) {
  return {
    avgSale: m?.defaults?.avgSale ?? FALLBACK.avgSale,
    connectRate: m?.defaults?.connectRate ?? FALLBACK.connectRate,
    commissionRate: m?.defaults?.commissionRate ?? FALLBACK.commissionRate,
  };
}

type Rates = { avgSale: string; closeFromConnects: string; connectRate: string; commissionRate: string };

/** Rates as the consultant's actuals where there is data (percent strings for the inputs). */
function actualRates(m: FunnelMetrics | undefined, closeTarget: number): { rates: Rates; fromData: Record<keyof Rates, boolean> } {
  const commission = m && m.revenuePaid > 0 ? m.commission / m.revenuePaid : null;
  const p = (n: number) => String(Math.round(n * 1000) / 10);
  const d = defaultsOf(m);
  return {
    rates: {
      avgSale: String(Math.round(m?.avgSale ?? d.avgSale)),
      closeFromConnects: p(m?.rates.closeFromConnects || closeTarget),
      connectRate: p(m?.rates.connectRate || d.connectRate),
      commissionRate: p(commission ?? d.commissionRate),
    },
    fromData: {
      avgSale: m?.avgSale != null,
      closeFromConnects: !!m?.rates.closeFromConnects,
      connectRate: !!m?.rates.connectRate,
      commissionRate: commission != null,
    },
  };
}

/** The consultant's top Why Board goal the calculator can plan for (soonest, not yet reached). */
function topGoal(goals: Goal[] | undefined): { goal: Goal; type: GoalType; remaining: number } | null {
  const map: Partial<Record<Goal["metric"], GoalType>> = { commission: "commission", revenue: "revenue", deals_paid: "deals" };
  const g = [...(goals ?? [])]
    .filter((x) => map[x.metric] && x.progress < 1 && x.targetDate >= sastDateKey(0))
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0];
  if (!g) return null;
  return { goal: g, type: map[g.metric]!, remaining: Math.max(1, g.targetValue - g.currentValue) };
}

/** Last day of the current SAST month, as the default window end. */
function endOfMonthKey(): string {
  const [y, mo] = sastDateKey(0).split("-").map(Number);
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/**
 * "What does it take?" — goal → paid deals → answered calls → dials per working
 * day. Rates default to the consultant's actuals (Fogg: Ability — a concrete,
 * believable daily number), and can be edited to test "what if".
 */
export function Calculator({ actuals, goals, closeTarget }: { actuals: FunnelMetrics | undefined; goals: Goal[] | undefined; closeTarget: number }) {
  const ids = useId();
  const initial = useMemo(() => actualRates(actuals, closeTarget), [actuals, closeTarget]);
  const fromGoal = useMemo(() => topGoal(goals), [goals]);

  const [goalType, setGoalType] = useState<GoalType>("commission");
  const [goalValue, setGoalValue] = useState("20000");
  const [endDate, setEndDate] = useState(endOfMonthKey);
  const [daysOverride, setDaysOverride] = useState<string>("");
  const [rates, setRates] = useState<Rates>(initial.rates);
  const [edited, setEdited] = useState(false);
  const [goalApplied, setGoalApplied] = useState<string | null>(null);

  // Follow the actuals as they load, until the consultant edits a rate.
  useEffect(() => {
    if (!edited) setRates(initial.rates);
  }, [initial, edited]);

  // Prefill once from the top Why Board goal.
  useEffect(() => {
    if (!fromGoal || goalApplied === fromGoal.goal.id) return;
    setGoalType(fromGoal.type);
    setGoalValue(String(fromGoal.remaining));
    setEndDate(fromGoal.goal.targetDate);
    setDaysOverride("");
    setGoalApplied(fromGoal.goal.id);
  }, [fromGoal, goalApplied]);

  const computedDays = Math.max(1, workingDaysUntil(endDate));
  const workingDays = daysOverride ? Number(daysOverride) : computedDays;

  const parsed = CalculatorInput.safeParse({
    goalType,
    goalValue: Number(goalValue),
    workingDays,
    avgSale: Number(rates.avgSale),
    closeFromConnects: Number(rates.closeFromConnects) / 100,
    connectRate: Number(rates.connectRate) / 100,
    commissionRate: Number(rates.commissionRate) / 100,
  });
  let result: CalculatorResult | null = null;
  let problem: string | null = null;
  if (parsed.success) {
    try {
      result = calculate(parsed.data);
    } catch {
      problem = "A commission goal needs a commission rate above 0%.";
    }
  } else {
    const k = String(parsed.error.issues[0]?.path[0] ?? "");
    problem =
      k === "goalValue"
        ? "Enter a goal above zero."
        : k === "workingDays"
          ? "Working days must be between 1 and 260."
          : k === "avgSale"
            ? "Enter an average sale in rand."
            : "Rates must be between 0.1% and 100%.";
  }

  const setRate = (k: keyof Rates) => (v: string) => {
    setEdited(true);
    setRates((r) => ({ ...r, [k]: v.replace(k === "avgSale" ? /[^\d]/g : /[^\d.]/g, "") }));
  };
  const resetRates = () => {
    setRates(initial.rates);
    setEdited(false);
  };

  const rateField = (k: keyof Rates, label: string, suffix: string) => (
    <div>
      <label htmlFor={`${ids}-${k}`} className="mb-1.5 block text-sm text-[--cp-text]">
        {label}
      </label>
      <div className="relative">
        <input
          id={`${ids}-${k}`}
          inputMode={k === "avgSale" ? "numeric" : "decimal"}
          value={rates[k]}
          onChange={(e) => setRate(k)(e.target.value)}
          aria-describedby={`${ids}-${k}-src`}
          className={cx(INPUT_CLASS, "border-[--cp-border] pr-10 tabular-nums")}
        />
        <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-[--cp-muted]">
          {suffix}
        </span>
      </div>
      <p id={`${ids}-${k}-src`} className="mt-1 text-xs text-[--cp-muted]">
        {rates[k] !== initial.rates[k] ? "Edited" : initial.fromData[k] ? "Your actual (this quarter)" : "Default — no data yet"}
      </p>
    </div>
  );

  return (
    <section aria-labelledby={`${ids}-h`} className={cx(SURFACE, "p-4 md:p-5")}>
      <h2 id={`${ids}-h`} className="font-heading text-lg text-[--cp-text]">
        What does it take?
      </h2>
      {goalApplied && fromGoal && (
        <p className="mt-0.5 text-sm text-[--cp-muted]">Planning for your Why Board goal: {fromGoal.goal.title}</p>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <div>
          <label htmlFor={`${ids}-type`} className="mb-1.5 block text-sm text-[--cp-text]">
            Goal
          </label>
          <select id={`${ids}-type`} value={goalType} onChange={(e) => setGoalType(e.target.value as GoalType)} className={cx(INPUT_CLASS, "border-[--cp-border]")}>
            {(Object.keys(GOAL_LABELS) as GoalType[]).map((g) => (
              <option key={g} value={g}>
                {GOAL_LABELS[g]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-val`} className="mb-1.5 block text-sm text-[--cp-text]">
            Target
          </label>
          <input
            id={`${ids}-val`}
            inputMode="numeric"
            value={goalValue}
            onChange={(e) => setGoalValue(e.target.value.replace(/[^\d]/g, ""))}
            className={cx(INPUT_CLASS, "border-[--cp-border] tabular-nums")}
          />
          <p className="mt-1 text-xs text-[--cp-muted]">{goalType === "deals" ? `${num(Number(goalValue))} paid deals` : formatZar(Number(goalValue))}</p>
        </div>
        <div>
          <SastDateTimeField label="By" showTime={false} value={{ date: endDate, time: "" }} minDate={sastDateKey(0)} onChange={(v) => { setEndDate(v.date); setDaysOverride(""); }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label htmlFor={`${ids}-days`} className="mb-1.5 block text-sm text-[--cp-text]">
            Working days
          </label>
          <input
            id={`${ids}-days`}
            inputMode="numeric"
            value={daysOverride || String(computedDays)}
            onChange={(e) => setDaysOverride(e.target.value.replace(/[^\d]/g, ""))}
            aria-describedby={`${ids}-days-h`}
            className={cx(INPUT_CLASS, "border-[--cp-border] tabular-nums")}
          />
        </div>
        <p id={`${ids}-days-h`} className="pb-3 text-xs text-[--cp-muted]">
          {daysOverride ? "Edited" : "Mon–Fri from today, SA public holidays excluded"}
        </p>
      </div>

      <details className="group mt-4 rounded-xl bg-[--cp-surface-2] p-3" open>
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-[--cp-text]">
          Your rates
          <span className="text-xs font-normal text-[--cp-muted] group-open:hidden">Show</span>
        </summary>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rateField("avgSale", "Average sale", "R")}
          {rateField("closeFromConnects", "Paid ÷ answered", "%")}
          {rateField("connectRate", "Answered ÷ dials", "%")}
          {rateField("commissionRate", "Commission rate", "%")}
        </div>
        <Button variant="ghost" className="mt-2" onClick={resetRates} disabled={!edited}>
          <RotateCcw size={15} aria-hidden /> Reset to my actuals
        </Button>
      </details>

      <div aria-live="polite" className="mt-4">
        {problem || !result ? (
          <p className="rounded-xl bg-[--cp-risk-soft] px-4 py-3 text-sm text-[--cp-text]">{problem ?? "Check the numbers above."}</p>
        ) : (
          <ResultChain goalType={goalType} goalValue={Number(goalValue)} r={result} days={workingDays} />
        )}
      </div>
    </section>
  );
}

/** The plan as a readable chain, ending in the daily number that matters. */
function ResultChain({ goalType, goalValue, r, days }: { goalType: GoalType; goalValue: number; r: CalculatorResult; days: number }) {
  const head = goalType === "commission" ? `${formatZar(goalValue)} commission` : goalType === "revenue" ? `${formatZar(goalValue)} revenue` : null;
  const links = [
    ...(head ? [head] : []),
    `${num(r.dealsNeeded)} paid ${r.dealsNeeded === 1 ? "deal" : "deals"}`,
    `${num(r.connectsNeeded)} answered calls`,
    `${num(r.dialsNeeded)} dials`,
  ];
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[--cp-text]">
        {links.map((l, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 && <ArrowRight size={14} aria-hidden className="text-[--cp-muted]" />}
            <span className="tabular-nums">{l}</span>
          </span>
        ))}
      </p>
      <div className="mt-3 rounded-xl border border-[--cp-border] p-3">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[--cp-muted]">Per working day · {num(days)} days</p>
        <p className="mt-1 font-heading text-2xl tabular-nums text-[--cp-text]">
          {num(r.perDay.dials)} dials <span className="text-[--cp-muted]">·</span> {num(r.perDay.connects)} answered{" "}
          <span className="text-[--cp-muted]">·</span> {r.perDay.deals.toFixed(2)} paid deals
        </p>
        <p className="mt-1 text-xs text-[--cp-muted]">
          Hitting it pays {formatZar(r.revenue)} in revenue and <span className="text-[--cp-progress]">{formatZar(r.commission)}</span> commission.
        </p>
      </div>
    </div>
  );
}
