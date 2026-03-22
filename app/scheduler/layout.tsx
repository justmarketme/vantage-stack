import type { ReactNode } from "react";

/** Avoid static prerender of client /scheduler (framer-motion + RSC chunk edge cases). */
export const dynamic = "force-dynamic";

export default function SchedulerLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
