import Link from "next/link";

type Props = {
  /** True only when the database reports zero active super admins (same as GET /api/admin/setup). */
  showFirstTimeSetup: boolean;
};

/** Shown at /admin when there is no admin session (public entry from the marketing site). */
export function AdminPublicLanding({ showFirstTimeSetup }: Props) {
  return (
    <main className="min-h-screen bg-background px-4 py-24">
      <div className="mx-auto max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-textMuted">VantageStack</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-textPrimary">Team access</h1>
        <p className="mt-3 text-sm text-textMuted">
          {showFirstTimeSetup
            ? "Create the first admin account once, then sign in here anytime."
            : "Sign in to open the CRM and internal tools."}
        </p>
        <div className="mt-10 flex flex-col gap-3 text-sm">
          {showFirstTimeSetup ? (
            <Link href="/admin/setup" className="vs-button-primary justify-center">
              First-time setup
            </Link>
          ) : null}
          <Link
            href="/admin/login?next=%2Fadmin"
            className={
              showFirstTimeSetup
                ? "rounded-xl border border-white/15 px-4 py-3 text-textMuted transition hover:border-white/25 hover:text-textPrimary"
                : "vs-button-primary justify-center"
            }
          >
            Log in
          </Link>
          {showFirstTimeSetup ? (
            <p className="text-xs text-textMuted">
              After setup you will use <span className="text-textPrimary">Log in</span> with your username and password — no separate “first-time” step.
            </p>
          ) : null}
          <Link href="/" className="text-textMuted underline">
            Back to site
          </Link>
        </div>
      </div>
    </main>
  );
}
