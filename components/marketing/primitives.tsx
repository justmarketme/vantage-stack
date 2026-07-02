import type { ReactNode } from "react";

// ───────────────────────────────────────────────────────────────────────────
// Shared marketing/landing-page primitives, styled with the real design tokens
// (vs-* utilities + accent #3B82F6, Space Grotesk headings, Inter body).
// These are presentational only (no hooks) and are composed inside each page's
// client Content component alongside <Reveal> and <BookCta>.
// ───────────────────────────────────────────────────────────────────────────

/** Outlined pill eyebrow with a green status dot (homepage hero pattern). */
export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3.5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-textMuted">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#22c55e]" />
      {children}
    </span>
  );
}

/** Small uppercase section eyebrow. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`vs-section-heading ${className}`}>{children}</p>;
}

/** Section H2. */
export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`vs-section-title max-w-2xl ${className}`}>{children}</h2>;
}

/** "Short answer" GEO callout under key H2s (AI-citation friendly). */
export function AnswerBox({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 rounded-r-xl border border-white/10 border-l-2 border-l-accent bg-white/[0.03] px-5 py-4 text-sm text-textPrimary/90 md:text-base">
      {children}
    </div>
  );
}

/** Inline stat emphasis (blue accent, bold). */
export function Stat({ children }: { children: ReactNode }) {
  return <span className="font-semibold text-[#93b4fb]">{children}</span>;
}

/** Body paragraph in the muted marketing tone. */
export function Prose({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`my-4 text-sm leading-relaxed text-textMuted md:text-base ${className}`}>{children}</p>;
}

/** 3-up band of headline stats. */
export function StatBand({ children }: { children: ReactNode }) {
  return <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">{children}</div>;
}
export function StatCard({ big, children }: { big: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-6 text-center text-sm text-textMuted">
      <span className="mb-1 block font-heading text-[2.4rem] font-semibold leading-none text-textPrimary">{big}</span>
      {children}
    </div>
  );
}

/** Responsive card grid (default 2 columns). */
export function CardGrid({ children, cols = 2, className = "" }: { children: ReactNode; cols?: 2 | 3 | 4; className?: string }) {
  const c = cols === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
  return <div className={`mt-6 grid grid-cols-1 gap-4 ${c} ${className}`}>{children}</div>;
}

/** Glassy card, optionally numbered (matches .step). */
export function Step({ n, title, children }: { n?: string; title: string; children: ReactNode }) {
  return (
    <div className="vs-card vs-card-hover border border-white/10">
      {n && <div className="font-heading text-[1.9rem] font-semibold leading-none text-accent">{n}</div>}
      <h3 className={`font-heading text-base text-textPrimary/95 ${n ? "mt-1.5" : ""}`}>{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-textMuted/90 md:text-sm">{children}</p>
    </div>
  );
}

/** Comparison table. rows: [rowLabel, ...cells] where each cell is {tone,text}. */
export type CompareCell = { tone: "yes" | "no" | "plain"; text: string };
export function CompareTable({ columns, rows }: { columns: string[]; rows: { label: string; cells: CompareCell[] }[] }) {
  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="bg-surface font-heading text-textPrimary">
            <th className="border-b border-white/10 px-4 py-3 text-left font-medium">&nbsp;</th>
            {columns.map((c) => (
              <th key={c} className="border-b border-white/10 px-4 py-3 text-left font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody className="text-textMuted">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="border-b border-white/10 px-4 py-3 font-medium text-textPrimary/90">{r.label}</td>
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  className={`border-b border-white/10 px-4 py-3 ${
                    cell.tone === "yes" ? "font-semibold text-emerald-400" : cell.tone === "no" ? "font-semibold text-rose-400" : ""
                  }`}
                >
                  {cell.text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** FAQ accordion (native <details>). First item open by default. */
export function Faq({ items }: { items: { q: string; a: string; open?: boolean }[] }) {
  return (
    <div className="mt-6">
      {items.map((f) => (
        <details key={f.q} open={f.open} className="border-b border-white/10 py-4 [&_summary]:list-none">
          <summary className="cursor-pointer font-heading text-base text-textPrimary/95 md:text-lg">{f.q}</summary>
          <p className="mt-3 text-sm leading-relaxed text-textMuted md:text-base">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

/**
 * Real image slot for a Google-Flow asset (not filled with body text).
 * Renders as an image placeholder carrying the Flow prompt as dev metadata.
 */
export function ImageSlot({ label, prompt, wide = false }: { label: string; prompt: string; wide?: boolean }) {
  return (
    <div
      title={prompt}
      className={`my-7 flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-gradient-to-br from-accent/[0.06] to-white/[0.01] px-6 text-center ${
        wide ? "min-h-[260px]" : "min-h-[220px]"
      }`}
    >
      <span className="font-heading text-sm font-semibold tracking-wide text-[#93b4fb]">▣ {label} — Google Flow</span>
      <span className="max-w-xl text-xs text-textMuted/70">Image slot — asset pending (Google Flow). Prompt on hover.</span>
    </div>
  );
}

/** Real embeddable video slot. Renders the embed when `src` is provided. */
export function VideoSlot({ label, src }: { label: string; src?: string }) {
  if (src) {
    return (
      <div className="mt-6 aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black">
        <iframe src={src} title={label} className="h-full w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      </div>
    );
  }
  return (
    <div className="mt-6 flex aspect-video items-center justify-center rounded-2xl border border-white/10 bg-[#050506] px-5 text-center text-sm font-medium text-textMuted">
      ▶ {label} — video slot, asset pending (Google Flow, SA voice)
    </div>
  );
}

/** Blue-bordered case-study box (pair with <ReviewFlag>). */
export function CaseBox({ children }: { children: ReactNode }) {
  return <div className="mt-6 rounded-2xl border border-accent/40 bg-accent/[0.06] p-6">{children}</div>;
}

/** Final CTA panel with the radial accent glow. */
export function FinalCta({ eyebrow, title, children, cta }: { eyebrow: string; title: ReactNode; children?: ReactNode; cta: ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-white/10 bg-surface px-6 py-14 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_0%,rgba(59,130,246,0.18),transparent_60%)]" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#93b4fb]">{eyebrow}</p>
        <h2 className="mx-auto mt-3 max-w-2xl font-heading text-2xl md:text-3xl">{title}</h2>
        {children && <p className="mx-auto mt-4 max-w-xl text-sm text-textMuted md:text-base">{children}</p>}
        <div className="mt-7 flex justify-center">{cta}</div>
      </div>
    </div>
  );
}

/** Glassy hero mockup (right column). rows describe the illustrative flow. */
export function HeroMock({ title, tag = "Illustrative", rows }: { title: string; tag?: string; rows: { n: string; t: string; s: string; done?: boolean }[] }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-gradient-to-br from-accent/[0.08] to-white/[0.02] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur">
      <div className="mb-4 flex items-center justify-between text-xs text-textMuted">
        <span>● {title}</span>
        <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[0.68rem] text-[#93b4fb]">{tag}</span>
      </div>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div
            key={r.n + r.t}
            className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 ${r.done ? "border-accent/40" : "border-white/10"} bg-white/[0.02]`}
          >
            <div className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full text-[0.72rem] text-white ${r.done ? "bg-emerald-500" : "bg-accent"}`}>
              {r.n}
            </div>
            <div>
              <div className="text-[0.85rem] text-textPrimary/90">{r.t}</div>
              <div className="text-[0.72rem] text-textMuted">{r.s}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Visible flag for an unresolved >>> REVIEW item. */
export function ReviewFlag({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200/90">
      <span className="mt-px font-semibold uppercase tracking-[0.14em] text-amber-300">⚠ Review</span>
      <span className="text-amber-100/80">{children}</span>
    </div>
  );
}
