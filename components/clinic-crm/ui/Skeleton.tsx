import { cx } from "./cx";

/** Placeholder block; size it with Tailwind classes (e.g. "h-4 w-32"). */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("cc-skeleton", className)} />;
}
