import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";

declare global {
  // eslint-disable-next-line no-var
  var qaLogExpectedActual:
    | ((params: { expected: unknown; actual: unknown; notes?: string }) => void)
    | undefined;
}

function ensureDir() {
  mkdirSync(join(process.cwd(), "data", "qa"), { recursive: true });
}

function appendExpectationLine(line: unknown) {
  ensureDir();
  const p = join(process.cwd(), "data", "qa", "expectations.ndjson");
  appendFileSync(p, JSON.stringify(line) + "\n", "utf8");
}

globalThis.qaLogExpectedActual = (params) => {
  const name = (expect as any).getState?.().currentTestName as string | undefined;
  if (!name) return;
  appendExpectationLine({
    testName: name,
    expected: params.expected ?? null,
    actual: params.actual ?? null,
    notes: params.notes ?? null,
  });
};

export {};

