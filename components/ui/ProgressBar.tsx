"use client";

type ProgressBarProps = {
  value: number; // 0-100
  label?: string;
};

function clamp01to100(v: number) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function ProgressBar(props: ProgressBarProps) {
  const value = clamp01to100(props.value);
  return (
    <div className="space-y-2" aria-label={props.label ?? "Progress"}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-all duration-300 ease-out" style={{ width: `${value}%` }} />
      </div>
      {props.label ? <p className="text-[11px] text-textMuted/80">{props.label}</p> : null}
    </div>
  );
}

