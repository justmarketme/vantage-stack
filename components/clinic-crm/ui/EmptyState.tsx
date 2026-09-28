import type { ReactNode } from "react";

/** First-run teaching moment: says what this space is for and offers the next action. */
export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-12">
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl cc-surface-2 cc-accent" aria-hidden>
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <p className="cc-muted mt-2 max-w-sm text-sm leading-relaxed">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
