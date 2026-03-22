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
  const [showSignup, setShowSignup] = useState(false);
  const flash = sp.get("message")?.trim() || null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/setup");
        const j = (await r.json()) as { needs_setup?: boolean; ok?: boolean };
        if (!cancelled && j.ok && j.needs_setup) setShowSignup(true);
      } catch {
        /* ignore */
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

  return (
    <main className="min-h-screen bg-background px-4 py-24">
      <div className="mx-auto max-w-sm">
        <p className="text-center font-heading text-lg font-semibold tracking-tight text-textPrimary">VantageStack</p>
        <p className="mt-1 text-center text-xs uppercase tracking-[0.2em] text-textMuted">CRM sign in</p>
        <h1 className="mt-6 font-heading text-2xl font-semibold text-textPrimary">Log in</h1>
        <p className="mt-2 text-sm text-textMuted">Internal access. Use your team username and password.</p>
        {flash ? (
          <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200" role="status">
            {flash}
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
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
          {process.env.NEXT_PUBLIC_CRM_REGISTRATION_ENABLED === "true" || showSignup ? (
            <li>
              <Link href="/admin/setup" className="underline hover:text-textPrimary">
                First-time setup
              </Link>
            </li>
          ) : null}
        </ul>

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
