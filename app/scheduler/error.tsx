"use client";

import { useEffect } from "react";
import { Navbar } from "../../components/layout/Navbar";

export default function SchedulerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Scheduler page error:", error);
  }, [error]);

  return (
    <div>
      <Navbar />
      <main className="vs-container pt-28 pb-16">
        <div className="max-w-5xl">
          <h1 className="font-heading text-3xl tracking-tight text-textPrimary">Scheduler Dashboard</h1>
          <div className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
            <p className="font-medium text-rose-200">Something went wrong</p>
            <p className="mt-2 text-sm text-rose-200/80">{error.message}</p>
            <p className="mt-2 text-xs text-textMuted">
              If the API returns 500, check that DATABASE_URL or SCHEDULER_PG_URL is set in .env.local and the database is reachable.
            </p>
            <button
              onClick={reset}
              className="mt-4 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-sm text-textPrimary hover:bg-white/10"
            >
              Try again
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
