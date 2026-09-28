"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  computeRoi,
  PRACTICE_DEFAULTS,
  PRICING_DEFAULTS,
  ROI_ASSUMPTIONS,
  type RoiResult,
} from "../../lib/clinics/schema";

/**
 * The ROI section.
 *
 * Every assumption is an input the visitor can move, every intermediate number
 * is shown, and the sources sit directly under the maths. A calculator that
 * only produces a big flattering figure is a slot machine; this one is meant to
 * survive a clinic owner redoing it on the back of an envelope.
 *
 * The negative case is rendered honestly — if the inputs do not pay back, it
 * says so rather than clamping to a reassuring number.
 */

const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

function Money({ value }: { value: number }) {
  return <span className="tabular-nums">{zar.format(Math.round(value))}</span>;
}

type FieldProps = {
  label: string;
  hint?: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  prefix?: string;
};

function NumberField({ label, hint, value, onChange, min, max, step = 1, suffix, prefix }: FieldProps) {
  const id = label.replace(/\W+/g, "-").toLowerCase();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-textPrimary">
        {label}
      </label>
      {hint && <p className="mt-0.5 text-xs text-textMuted">{hint}</p>}
      <div className="mt-2 flex items-center gap-3">
        <div className="relative flex-1">
          {prefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-textMuted">
              {prefix}
            </span>
          )}
          <input
            id={id}
            type="number"
            className={`vs-input tabular-nums ${prefix ? "pl-7" : ""} ${suffix ? "pr-9" : ""}`}
            value={Number.isFinite(value) ? value : ""}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              const n = Number(e.target.value);
              // Clamp rather than reject: a visitor dragging past the bound
              // should land on the bound, not on an empty field.
              if (!Number.isFinite(n)) return;
              onChange(Math.min(max, Math.max(min, n)));
            }}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-textMuted">
              {suffix}
            </span>
          )}
        </div>
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        className="mt-2 w-full accent-accent"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Row({
  label,
  children,
  strong = false,
  muted = false,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-4 border-b border-white/5 py-2 last:border-b-0",
        strong ? "text-textPrimary" : muted ? "text-textMuted" : "text-textPrimary/90",
      ].join(" ")}
    >
      <span className={strong ? "text-sm font-medium" : "text-sm"}>{label}</span>
      <span className={strong ? "font-heading text-base" : "text-sm tabular-nums"}>{children}</span>
    </div>
  );
}

export function RoiCalculator({ onResult }: { onResult?: (r: RoiResult) => void }) {
  const [enquiries, setEnquiries] = useState<number>(PRACTICE_DEFAULTS.enquiriesPerMonth);
  const [leakPct, setLeakPct] = useState<number>(PRACTICE_DEFAULTS.leakRatePct);
  const [value, setValue] = useState<number>(PRACTICE_DEFAULTS.avgAppointmentValueZar);
  const [noShowPct, setNoShowPct] = useState<number>(PRACTICE_DEFAULTS.noShowRatePct);
  const [appointments, setAppointments] = useState<number>(PRACTICE_DEFAULTS.appointmentsPerMonth);
  const [recapturePct, setRecapturePct] = useState(
    Math.round(ROI_ASSUMPTIONS.defaultRecaptureRate * 100),
  );
  const [showAssumptions, setShowAssumptions] = useState(false);

  const result = useMemo(
    () =>
      computeRoi({
        enquiriesPerMonth: enquiries,
        leakRate: leakPct / 100,
        avgAppointmentValue: value,
        noShowRate: noShowPct,
        appointmentsPerMonth: appointments,
        recaptureRate: recapturePct / 100,
        monthlyCost: PRICING_DEFAULTS.monthlyCostZar,
        setupCost: PRICING_DEFAULTS.setupCostZar,
      }),
    [enquiries, leakPct, value, noShowPct, appointments, recapturePct],
  );

  // Reporting upward is a side effect and must not happen during render —
  // calling the parent's setState from inside useMemo makes React warn about
  // updating one component while rendering another, and is a real correctness
  // hazard rather than a lint nicety.
  //
  // `onResult` is intentionally excluded from the dependency list: the parent
  // passes a plain setState function today, but an inline arrow would change
  // identity every render and turn this into an infinite loop. Depending on the
  // computed result alone is both sufficient and safe.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    onResultRef.current?.(result);
  }, [result]);

  const paysBack = result.paybackMonths !== null;

  return (
    <div className="vs-grid !gap-8 md:!gap-10">
      {/* ── Inputs ─────────────────────────────────────────────── */}
      <div className="vs-card">
        <p className="vs-section-heading">Your numbers</p>
        <p className="mb-6 text-sm text-textMuted">
          Change anything that does not match your practice. Nothing is locked.
        </p>

        <div className="space-y-6">
          <NumberField
            label="Enquiries a month"
            hint="Calls, WhatsApps, forms, Maps — everyone who reaches out."
            value={enquiries}
            onChange={setEnquiries}
            min={10}
            max={1000}
            step={10}
          />
          <NumberField
            label="Share you never convert"
            hint="Rings out, replied to too late, or nobody followed up."
            value={leakPct}
            onChange={setLeakPct}
            min={5}
            max={60}
            suffix="%"
          />
          <NumberField
            label="Average value per appointment"
            hint="Blended across consults and treatment, not your consult fee alone."
            value={value}
            onChange={setValue}
            min={300}
            max={15000}
            step={100}
            prefix="R"
          />
          <NumberField
            label="Appointments a month"
            value={appointments}
            onChange={setAppointments}
            min={20}
            max={3000}
            step={10}
          />
          <NumberField
            label="No-show rate"
            hint="SA/international averages sit near 18%. Dentistry ~15%, dermatology ~30%."
            value={noShowPct}
            onChange={setNoShowPct}
            min={2}
            max={50}
            suffix="%"
          />
        </div>
      </div>

      {/* ── Output ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-6">
        <div className="vs-card relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-accent/10 blur-3xl"
          />
          <p className="vs-section-heading">What the system recovers</p>

          <p className="mt-2 font-heading text-4xl md:text-5xl text-accent">
            <Money value={result.recoveredRevenueMonthly} />
          </p>
          <p className="mt-1 text-sm text-textMuted">recovered revenue a month, before cost</p>

          <div className="mt-6 space-y-0.5">
            <Row label="Enquiries lost today" muted>
              {result.lostEnquiriesMonthly.toFixed(0)} a month
            </Row>
            <Row label={`Recovered at ${recapturePct}%`}>
              {result.recoveredEnquiriesMonthly.toFixed(0)} → <Money value={result.recoveredEnquiryRevenue} />
            </Row>
            <Row label="No-shows today" muted>
              {result.noShowsMonthly.toFixed(0)} a month
            </Row>
            <Row label="Prevented by reminders (33%)">
              {result.recoveredNoShows.toFixed(0)} a month
            </Row>
            <Row label="…net of those who rebook anyway (50%)">
              <Money value={result.recoveredNoShowRevenue} />
            </Row>
            <Row label="Less system cost" muted>
              −<Money value={result.monthlyCost} />
            </Row>
            <Row label="Net gain a month" strong>
              <span className={result.netMonthlyGain > 0 ? "text-accent" : "text-textMuted"}>
                <Money value={result.netMonthlyGain} />
              </span>
            </Row>
          </div>
        </div>

        {/* Payback — the single sentence this whole section exists to produce. */}
        <div className="vs-card !py-5">
          {paysBack ? (
            <>
              <p className="font-heading text-xl md:text-2xl">
                Pays for itself in{" "}
                <span className="text-accent">
                  {result.paybackMonths! < 1
                    ? "under a month"
                    : `${result.paybackMonths!.toFixed(1)} months`}
                </span>
              </p>
              <p className="mt-2 text-sm text-textMuted">
                Setup is <Money value={PRICING_DEFAULTS.setupCostZar} />. At{" "}
                <Money value={result.netMonthlyGain} /> net a month, that is recovered in{" "}
                {result.paybackMonths! < 1 ? "under a month" : `${result.paybackMonths!.toFixed(1)} months`},
                leaving <Money value={result.firstYearNet} /> in year one.
              </p>
            </>
          ) : (
            <>
              <p className="font-heading text-xl md:text-2xl text-textMuted">
                At these numbers, it does not pay back.
              </p>
              <p className="mt-2 text-sm text-textMuted">
                Recovered revenue of <Money value={result.recoveredRevenueMonthly} /> does not
                cover <Money value={result.monthlyCost} /> a month. A practice this size is
                better served by a conversation than by this system — say so on the form and we
                will tell you straight.
              </p>
            </>
          )}
        </div>

        {/* Assumptions, disclosed rather than buried. */}
        <div className="vs-card !py-5">
          <button
            type="button"
            onClick={() => setShowAssumptions((v) => !v)}
            aria-expanded={showAssumptions}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="text-sm font-medium">Where these assumptions come from</span>
            <span aria-hidden className="text-textMuted">
              {showAssumptions ? "−" : "+"}
            </span>
          </button>

          {showAssumptions && (
            <div className="mt-4 space-y-4 text-xs leading-relaxed text-textMuted">
              <div>
                <p className="font-medium text-textPrimary/90">Recapture rate — adjustable</p>
                <p className="mt-1">
                  The famous number here is Oldroyd&rsquo;s MIT/InsideSales study (2007, ~15,000
                  leads): contact within five minutes carried roughly 21&times; the odds of
                  qualifying versus thirty minutes. It is usually miscredited to Harvard — HBR&rsquo;s
                  separate 2011 audit of 2,241 firms is where the 42-hour average response and
                  &ldquo;23% never respond&rdquo; come from.
                </p>
                <p className="mt-2">
                  <span className="text-textPrimary/80">We do not build on that figure.</span> Two
                  reasons. Firms that answer in five minutes differ from slow ones in other ways —
                  better staff, better systems — so response time is not cleanly isolated. And
                  21&times; is a multiplier on a tiny base: 0.1% becomes 2.1%, which is still 2%.
                  Quoting it as a revenue multiple is the usual abuse of this study.
                </p>
                <p className="mt-2">
                  What we rest on is simpler and harder to argue with: an enquiry that rings out
                  after hours and is never returned converts at zero. Recovering a share of those
                  is arithmetic. Set that share yourself:
                </p>
                <input
                  type="range"
                  aria-label="Recapture rate"
                  className="mt-3 w-full accent-accent"
                  min={ROI_ASSUMPTIONS.recaptureRateMin * 100}
                  max={ROI_ASSUMPTIONS.recaptureRateMax * 100}
                  value={recapturePct}
                  onChange={(e) => setRecapturePct(Number(e.target.value))}
                />
                <p className="mt-1 tabular-nums text-accent">{recapturePct}% of lost enquiries recovered</p>
              </div>

              <div>
                <p className="font-medium text-textPrimary/90">No-show recovery — 33%</p>
                <p className="mt-1">
                  Cochrane (Gurol-Urganci et al. 2013, 7 studies, 5,841 participants, moderate
                  quality) puts SMS reminders at a risk ratio of <strong>1.14</strong> for
                  attendance, 95% CI 1.03&ndash;1.26. Applied to an 18% no-show baseline that
                  implies anywhere from a 14% reduction (lower bound) to 64% (point estimate). We
                  use 33% — inside the interval, well below the point estimate.
                </p>
                <p className="mt-2">
                  The often-quoted &ldquo;67.8% vs 78.6% attendance&rdquo; pair are raw pooled group
                  rates, not a controlled contrast, so we do not derive the effect from them.
                </p>
                <p className="mt-2">
                  It matters locally that South African research finds the commonest reason for
                  missing a doctor&rsquo;s appointment is simply <em>forgetting</em> — which is
                  exactly what a reminder fixes. One SA regional hospital has reported
                  non-attendance up to 40%.
                </p>
                <p className="mt-2">
                  We then halve the rand value, because a patient who misses often rebooks anyway —
                  preventing the miss brings revenue forward rather than creating it. Counting every
                  prevented no-show as new money is the easiest way to make a calculator like this
                  dishonest, so we do not.
                </p>
              </div>

              <div>
                <p className="font-medium text-textPrimary/90">Baselines</p>
                <p className="mt-1">
                  No-show rates averaged 23% across 105 studies (range 4&ndash;79%); other pooled
                  analyses put the mean nearer 15%. By specialty: dentistry ~15%, optometry ~25%,
                  dermatology ~30%. SA private dental examinations run roughly R300&ndash;R800, so
                  the R1,500 default reflects a blended book including treatment, not a consult fee.
                  SA prices are not regulated and vary widely.
                </p>
              </div>

              <p className="border-t border-white/5 pt-3">
                This is an estimate built from your inputs, not a forecast or a guarantee. It
                models booking and attendance operations only — it says nothing about clinical
                outcomes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
