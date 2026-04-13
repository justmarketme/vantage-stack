"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { PasswordField } from "../../../components/admin/PasswordField";

type Props = {
  defaultNext: string;
};

function LoginInner({ defaultNext }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** null = still fetching; true = no super admin yet — show setup-first, hide login until user expands. */
  const [needsFirstSetup, setNeedsFirstSetup] = useState<boolean | null>(null);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const flash = sp.get("message")?.trim() || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/setup");
        const j = (await r.json()) as { needs_setup?: boolean; ok?: boolean };
        if (cancelled) return;
        if (j.ok && j.needs_setup) {
          setNeedsFirstSetup(true);
          setShowLoginForm(false);
        } else {
          setNeedsFirstSetup(false);
          setShowLoginForm(true);
        }
      } catch {
        if (!cancelled) {
          setNeedsFirstSetup(false);
          setShowLoginForm(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
          remember_me: remember,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; retry_after_minutes?: number };
      if (!res.ok || !json.ok) {
        setErr(json.error ?? `Login failed (${res.status})`);
        return;
      }
      const next = defaultNext.startsWith("/") ? defaultNext : "/admin/dashboard";
      router.replace(next);
      router.refresh();
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  const firstTimeBlock =
    needsFirstSetup === true ? (
      <div className="mt-6 rounded-xl border border-emerald-500/25 bg-emerald-950/20 px-4 py-5 text-left">
        <h2 className="font-heading text-lg font-semibold text-textPrimary">New environment</h2>
        <p className="mt-2 text-sm text-textMuted">
          No admin account exists yet. Start here — you do not need a username or password until after you create the first admin.
        </p>
        <Link href="/admin/setup" className="vs-button-primary mt-4 flex w-full justify-center text-center">
          Create first admin
        </Link>
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-sky-300 underline hover:text-sky-200"
          onClick={() => setShowLoginForm(true)}
        >
          I already have an account — sign in
        </button>
      </div>
    ) : null;

  return (
    <main className="min-h-screen bg-background px-4 py-24">
      <div className="mx-auto max-w-sm">
        <p className="text-center font-heading text-lg font-semibold tracking-tight text-textPrimary">VantageStack</p>
        <p className="mt-1 text-center text-xs uppercase tracking-[0.2em] text-textMuted">CRM sign in</p>
        {needsFirstSetup === null ? (
          <>
            <h1 className="mt-6 font-heading text-2xl font-semibold text-textPrimary">Team access</h1>
            <p className="mt-2 text-sm text-textMuted">Checking this environment…</p>
          </>
        ) : needsFirstSetup === true ? (
          <>
            <h1 className="mt-6 font-heading text-2xl font-semibold text-textPrimary">Get started</h1>
            <p className="mt-2 text-sm text-textMuted">Choose first-time setup or sign in if you already have credentials.</p>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-heading text-2xl font-semibold text-textPrimary">Log in</h1>
            <p className="mt-2 text-sm text-textMuted">Internal access. Use your team username and password.</p>
          </>
        )}
        {flash ? (
          <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200" role="status">
            {flash}
          </p>
        ) : null}

        {firstTimeBlock}

        {showLoginForm && needsFirstSetup === false ? (
          <div className="mt-6 space-y-2">
            <p className="text-center text-sm text-textMuted">No username or password yet? Create the first admin for this environment.</p>
            <Link
              href="/admin/setup"
              className="flex w-full justify-center rounded-xl border border-white/15 px-4 py-3 text-sm font-medium text-textPrimary transition hover:border-white/25 hover:bg-white/5"
            >
              First-time setup
            </Link>
          </div>
        ) : null}

        {showLoginForm ? (
          <>
            {needsFirstSetup === true ? (
              <h2 className="mt-10 font-heading text-lg font-semibold text-textPrimary">Sign in</h2>
            ) : null}
            <form onSubmit={onSubmit} className={`space-y-4 ${needsFirstSetup === true ? "mt-4" : needsFirstSetup === false ? "mt-6" : "mt-8"}`}>
              <div>
                <label htmlFor="admin-username" className="mb-1 block text-xs font-medium text-textMuted">
                  Username
                </label>
                <input
                  id="admin-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="vs-input"
                  required
                />
              </div>
              <PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} required />
              <label className="flex items-center gap-2 text-sm text-textMuted">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-white/20" />
                Remember me for 30 days
              </label>
              {err ? (
                <p className="text-sm text-rose-300" role="alert">
                  {err}
                </p>
              ) : null}
              <button type="submit" disabled={loading} className="vs-button-primary w-full justify-center disabled:opacity-50">
                {loading ? "Signing in…" : "Log in"}
              </button>
            </form>
          </>
        ) : null}

        {showLoginForm ? (
          <ul className="mt-6 space-y-2 text-center text-sm text-textMuted">
            <li>
              <Link href="/admin/forgot-username" className="underline hover:text-textPrimary">
                Forgot username
              </Link>
            </li>
            <li>
              <Link href="/admin/forgot-password" className="underline hover:text-textPrimary">
                Forgot password
              </Link>
            </li>
          </ul>
        ) : null}

        <p className="mt-10 text-center text-xs text-textMuted">
          <Link href="/" className="underline">
            Back to site
          </Link>
        </p>
      </div>
    </main>
  );
}

export function AdminLoginForm(props: Props) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background px-4 py-24 text-center text-textMuted">Loading…</main>}>
      <LoginInner {...props} />
    </Suspense>
  );
}
