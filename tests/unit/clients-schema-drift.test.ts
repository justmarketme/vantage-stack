import { readFileSync } from "fs";
import path from "path";
import { CLIENT_BASE_COLUMNS } from "../../lib/crm/schema-columns";

/**
 * Drift guard: every `public.clients` column written by an INSERT or UPDATE must be
 * creatable on the database — i.e. it must be a BASE column (migration 001) OR added by
 * `ensureCrmSchema()` in lib/crm/db.ts. If a write references a column that nothing
 * creates, the app 500s with `column "<x>" of relation "clients" does not exist`.
 *
 * This test reads the source files directly (no DB connection) so it runs in CI and
 * fails the PR the moment someone adds a column to an INSERT/UPDATE without also adding
 * it to ensureCrmSchema. It would have caught both the current_website_status (blueprint
 * submit) and website_enrichment (client edit) regressions.
 */

const root = path.join(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** Columns added at runtime by ensureCrmSchema (only the public.clients ALTERs). */
function ddlClientColumns(): string[] {
  const db = read("lib/crm/db.ts");
  return uniq(
    [...db.matchAll(/alter table public\.clients add column if not exists (\w+)/gi)].map((m) => m[1]),
  );
}

/** Column list of the `insert into public.clients ( … ) values` statement in intake.ts. */
function insertColumns(): string[] {
  const src = read("lib/crm/intake.ts");
  const m = src.match(/insert into public\.clients\s*\(([\s\S]*?)\)\s*values/i);
  if (!m) return [];
  return uniq(
    m[1]
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^[a-z_]+$/.test(s)),
  );
}

/** Assignment targets of every `update public.clients set … where` block in client-update.ts. */
function updateColumns(): string[] {
  const src = read("lib/crm/client-update.ts");
  const cols: string[] = [];
  for (const block of src.matchAll(/update public\.clients set([\s\S]*?)where\s+id/gi)) {
    for (const a of block[1].matchAll(/^\s*([a-z_]+)\s*=/gm)) cols.push(a[1]);
  }
  return uniq(cols);
}

describe("public.clients schema drift guard", () => {
  const base = new Set<string>(CLIENT_BASE_COLUMNS);
  const ddl = ddlClientColumns();
  const allowed = new Set<string>([...base, ...ddl]);
  const inserts = insertColumns();
  const updates = updateColumns();

  // Sanity floors — a broken parser (0 matches) must fail loudly, not pass vacuously.
  test("parsers extracted a plausible number of columns", () => {
    expect(ddl.length).toBeGreaterThan(20);
    expect(inserts.length).toBeGreaterThan(30);
    expect(updates.length).toBeGreaterThan(10);
  });

  test("every INSERTed column is a base column or created by ensureCrmSchema", () => {
    const missing = inserts.filter((c) => !allowed.has(c));
    expect(missing).toEqual([]);
  });

  test("every UPDATEd column is a base column or created by ensureCrmSchema", () => {
    const missing = updates.filter((c) => !allowed.has(c));
    expect(missing).toEqual([]);
  });
});
