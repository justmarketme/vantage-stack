/**
 * QA regressions found in the browser pass. These views are client components that need
 * the full App Router to render, so the guards are source-level: they fail if the fix is
 * reverted.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "../../../..");
const src = (p: string) => readFileSync(join(root, p), "utf8");

describe("QA: nonce CSP and the no-flash theme boot script", () => {
  const layout = src("app/clinic-crm/layout.tsx");

  it("reads the per-request nonce set by middleware", () => {
    expect(layout).toMatch(/headers\(\)\)\.get\("x-nonce"\)/);
  });

  it("stamps the nonce on the inline theme script (CSP blocks it otherwise)", () => {
    expect(layout).toMatch(/<script[^>]*\bnonce=\{nonce\}[^>]*themeBootScript/);
  });
});

describe("QA: load failures are shown, not disguised as empty data", () => {
  it("Inbox list renders an error (not 'No conversations yet') when the fetch fails", () => {
    const v = src("components/clinic-crm/views/InboxView.tsx");
    expect(v).toMatch(/convos\.error && !convos\.data/);
    expect(v).toMatch(/msgs\.error && !msgs\.data/);
  });

  it("Goals board renders an error when the fetch fails", () => {
    expect(src("components/clinic-crm/views/GoalsView.tsx")).toMatch(/q\.error && !q\.data/);
  });
});
