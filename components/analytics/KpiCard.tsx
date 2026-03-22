import { ReactNode } from "react";

export function KpiCard(props: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
      <div className="text-xs font-semibold tracking-wide text-slate-500">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{props.value}</div>
      {props.sub ? <div className="mt-2 text-xs text-slate-500">{props.sub}</div> : null}
    </div>
  );
}

