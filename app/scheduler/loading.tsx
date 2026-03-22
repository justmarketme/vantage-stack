import { Navbar } from "../../components/layout/Navbar";

export default function SchedulerLoading() {
  return (
    <div>
      <Navbar />
      <main className="vs-container pt-28 pb-16">
      <div className="max-w-5xl">
        <h1 className="font-heading text-3xl tracking-tight">Scheduler Dashboard</h1>
        <p className="mt-4 text-sm text-textMuted animate-pulse">Loading jobs…</p>
      </div>
    </main>
    </div>
  );
}
