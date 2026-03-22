import { ReactNode } from "react";

export function ChartCard(props: { title: string; subtitle?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-slate-900">{props.title}</div>
          {props.subtitle ? <div className="mt-1 text-xs text-slate-500">{props.subtitle}</div> : null}
        </div>
        {props.right ? <div className="shrink-0">{props.right}</div> : null}
      </header>
      <div className="mt-4">{props.children}</div>
    </section>
  );
}

