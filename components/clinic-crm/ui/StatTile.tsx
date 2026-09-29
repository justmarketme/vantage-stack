import type { ReactNode } from "react";
import { Skeleton } from "./Skeleton";

export function StatTile({
  label,
  value,
  unit,
  hint,
  icon,
  loading,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="cc-card p-4 md:p-5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="cc-muted text-[13px] font-medium leading-tight">{label}</span>
        {icon && (
          <span className="cc-accent shrink-0" aria-hidden>
            {icon}
          </span>
        )}
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20" />
      ) : (
        <div className="flex items-baseline gap-1.5">
          <span className="cc-heading cc-num text-[30px] md:text-[34px] font-semibold leading-none">{value}</span>
          {unit && <span className="cc-muted text-sm">{unit}</span>}
        </div>
      )}
      {hint && <span className="cc-muted text-xs leading-snug">{hint}</span>}
    </div>
  );
}
