/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readExpectationsMap(cwd) {
  try {
    const p = path.join(cwd, "data", "qa", "expectations.ndjson");
    const txt = fs.readFileSync(p, "utf8");
    const map = new Map();
    for (const line of txt.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const obj = JSON.parse(line);
      if (obj && obj.testName) map.set(String(obj.testName), obj);
    }
    return map;
  } catch {
    return new Map();
  }
}

function ms(n) {
  return typeof n === "number" && Number.isFinite(n) ? Math.round(n) : null;
}

class VantageQaReporter {
  onRunStart() {
    this._runStartedAt = Date.now();
    this._results = [];
  }

  onTestResult(_test, testResult) {
    for (const tr of testResult.testResults || []) {
      const fullName = tr.fullName || tr.title || "unknown";
      const expectations = (globalThis.__QA_EXPECTATIONS__ || {})[fullName] || {};

      this._results.push({
        testName: fullName,
        status: tr.status,
        expected: expectations.expected ?? null,
        actual: expectations.actual ?? null,
        notes: expectations.notes ?? null,
        executionTimeMs: ms(tr.duration),
        failureMessages: (tr.failureMessages || []).slice(0, 3),
      });
    }
  }

  onRunComplete(_contexts, results) {
    const finishedAt = Date.now();
    const expectationsByName = readExpectationsMap(process.cwd());
    const report = {
      generatedAt: new Date().toISOString(),
      totals: {
        tests: results.numTotalTests,
        passed: results.numPassedTests,
        failed: results.numFailedTests,
        pending: results.numPendingTests,
        runtimeMs: finishedAt - (this._runStartedAt || finishedAt),
      },
      criticalIssues:
        results.numFailedTests > 0
          ? this._results
              .filter((r) => r.status === "failed")
              .map((r) => ({ testName: r.testName, failureMessages: r.failureMessages }))
          : [],
      results: this._results.map((r) => {
        const meta = expectationsByName.get(r.testName) || null;
        return {
          ...r,
          expected: meta ? meta.expected : r.expected,
          actual: meta ? meta.actual : r.actual,
          notes: meta ? meta.notes : r.notes,
        };
      }),
    };

    const outDir = path.join(process.cwd(), "data", "qa");
    ensureDir(outDir);
    fs.writeFileSync(path.join(outDir, "test-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");

    const summaryLine = `QA Summary: total=${report.totals.tests} passed=${report.totals.passed} failed=${report.totals.failed} runtimeMs=${report.totals.runtimeMs}`;
    console.log(summaryLine);
  }
}

module.exports = VantageQaReporter;

