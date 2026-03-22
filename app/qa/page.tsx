export const dynamic = "force-dynamic";

type QaReport = {
  generatedAt?: string;
  totals?: { tests: number; passed: number; failed: number; pending?: number; runtimeMs?: number };
  criticalIssues?: Array<{ testName: string; failureMessages: string[] }>;
  results?: Array<{
    testName: string;
    status: "passed" | "failed" | "pending" | "skipped";
    expected?: unknown;
    actual?: unknown;
    executionTimeMs?: number | null;
  }>;
};

async function fetchReport(): Promise<QaReport | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ""}/api/qa/latest`, { cache: "no-store" });
    const json = await res.json();
    return json?.ok ? (json.report as QaReport) : null;
  } catch {
    return null;
  }
}

function pill(status: string) {
  if (status === "passed") return "bg-emerald-500/15 text-emerald-200 border-emerald-500/25";
  if (status === "failed") return "bg-rose-500/15 text-rose-200 border-rose-500/25";
  return "bg-white/10 text-textMuted border-white/10";
}

export default async function QaPage() {
  const report = await fetchReport();
  const totals = report?.totals ?? null;
  const issues = report?.criticalIssues ?? [];
  const results = report?.results ?? [];

  return (
    <main className="vs-container py-12">
      <div className="mb-8 flex flex-col gap-2">
        <p className="vs-section-heading">Quality Assurance</p>
        <h1 className="vs-section-title">Test Results Dashboard</h1>
        <p className="text-sm text-textMuted">
          Latest run: <span className="text-textPrimary">{report?.generatedAt ?? "—"}</span>
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="vs-card border border-white/10">
          <div className="text-xs text-textMuted">Total</div>
          <div className="mt-2 text-2xl font-heading">{totals?.tests ?? "—"}</div>
        </div>
        <div className="vs-card border border-white/10">
          <div className="text-xs text-textMuted">Passed</div>
          <div className="mt-2 text-2xl font-heading text-emerald-200">{totals?.passed ?? "—"}</div>
        </div>
        <div className="vs-card border border-white/10">
          <div className="text-xs text-textMuted">Failed</div>
          <div className="mt-2 text-2xl font-heading text-rose-200">{totals?.failed ?? "—"}</div>
        </div>
        <div className="vs-card border border-white/10">
          <div className="text-xs text-textMuted">Runtime</div>
          <div className="mt-2 text-2xl font-heading">{totals?.runtimeMs != null ? `${Math.round(totals.runtimeMs / 1000)}s` : "—"}</div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="vs-card border border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-textMuted">Critical issues</div>
              <div className="mt-1 text-lg font-heading">Failures</div>
            </div>
            <span className={`rounded-full border px-3 py-1 text-xs ${issues.length ? "border-rose-500/25 bg-rose-500/10 text-rose-200" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"}`}>
              {issues.length ? `${issues.length} failing` : "All green"}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {!issues.length ? (
              <div className="text-sm text-textMuted">No critical failures in the latest run.</div>
            ) : (
              issues.slice(0, 8).map((i) => (
                <div key={i.testName} className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                  <div className="text-sm text-rose-100">{i.testName}</div>
                  <div className="mt-2 text-[11px] text-rose-200/80 whitespace-pre-wrap">
                    {(i.failureMessages?.[0] ?? "").slice(0, 900) || "—"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="vs-card border border-white/10">
          <div className="text-xs text-textMuted">All tests</div>
          <div className="mt-1 text-lg font-heading">Detailed results</div>
          <div className="mt-4 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-[0.18em] text-textMuted/80">
                <tr>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Test</th>
                  <th className="py-2 pr-3">Expected</th>
                  <th className="py-2 pr-3">Actual</th>
                  <th className="py-2 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="text-textMuted">
                {results.slice(0, 200).map((r) => (
                  <tr key={r.testName} className="border-t border-white/5">
                    <td className="py-2 pr-3">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 ${pill(r.status)}`}>{r.status}</span>
                    </td>
                    <td className="py-2 pr-3 text-textPrimary/90">{r.testName}</td>
                    <td className="py-2 pr-3">
                      <code className="text-[11px]">{r.expected ? JSON.stringify(r.expected).slice(0, 120) : "—"}</code>
                    </td>
                    <td className="py-2 pr-3">
                      <code className="text-[11px]">{r.actual ? JSON.stringify(r.actual).slice(0, 120) : "—"}</code>
                    </td>
                    <td className="py-2 text-right">{r.executionTimeMs != null ? `${r.executionTimeMs}ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!results.length && <div className="text-sm text-textMuted">No report found yet. Run `npm run test:critical`.</div>}
          </div>
        </div>
      </section>
    </main>
  );
}

