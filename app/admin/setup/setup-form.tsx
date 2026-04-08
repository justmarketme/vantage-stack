"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PasswordField } from "../../../components/admin/PasswordField";
import { PasswordRequirements } from "../../../components/admin/PasswordRequirements";
import { checkPasswordPolicy, isValidUsername } from "../../../lib/auth/password-policy";

function looksLikeDnsFailure(message: string | null): boolean {
  if (!message) return false;
  return /ENOTFOUND|getaddrinfo|EAI_AGAIN/i.test(message);
}

/** null = still checking, true = show form, false = error or blocked */
export function FirstAdminSetupForm() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /** Strict Mode–safe: do not Abort fetch on cleanup (that can strand the UI on “Checking…”). */
  useEffect(() => {
    let alive = true;

    (async () => {
      setErr(null);
      try {
        const r = await Promise.race([
          fetch("/api/admin/setup", { cache: "no-store" }),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error("CLIENT_TIMEOUT")), 55_000),
          ),
        ]);
        if (!alive) return;

        let j: { ok?: boolean; needs_setup?: boolean; error?: string } = {};
        try {
          j = (await r.json()) as typeof j;
        } catch {
          if (!alive) return;
          setErr("Invalid response from server.");
          setReady(false);
          return;
        }
        if (!alive) return;

        if (!r.ok) {
          setErr(
            j.error ??
              `Server returned ${r.status}. For first-time setup, ensure DATABASE_URL in .env.local reaches your Postgres (e.g. Supabase).`,
          );
          setReady(false);
          return;
        }
        if (!j.ok) {
          setErr(j.error ?? "Could not read setup status.");
          setReady(false);
          return;
        }
        if (!j.needs_setup) {
          router.replace("/admin/login");
          return;
        }
        setReady(true);
      } catch (e) {
        if (!alive) return;
        const timedOut = e instanceof Error && e.message === "CLIENT_TIMEOUT";
        setErr(
          timedOut
            ? "Request timed out. Confirm `npm run dev` is running and DATABASE_URL is correct, then retry."
            : "Could not reach the server. Is `npm run dev` running on this machine?",
        );
        setReady(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!isValidUsername(username)) {
      setErr("Username: 3–20 characters, letters, numbers, underscores only");
      return;
    }
    const pol = checkPasswordPolicy(password);
    if (!pol.ok) {
      setErr("Password does not meet requirements");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match");
      return;
    }
    if (!terms) {
      setErr("You must accept the terms of service");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          username: username.trim(),
          password,
          full_name: fullName.trim() || null,
          terms_accepted: true as const,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setErr(json.error ?? "Setup failed");
        return;
      }
      const msg =
        "Account created. Sign in below with your username and password. If you received a verification email, you can open that link when you are ready.";
      router.replace(`/admin/login?message=${encodeURIComponent(msg)}`);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (ready === null) {
    return (
      <main className="min-h-screen bg-background px-4 py-24">
        <div className="mx-auto max-w-md text-center">
          <p className="text-sm text-textMuted">Checking setup status…</p>
          <p className="mt-4 text-xs leading-relaxed text-textMuted/90">
            First time here: we confirm your database is reachable and that no super admin exists yet. After you create an
            account, use <span className="text-textPrimary">Admin login</span> with your username and password, then open{" "}
            <span className="text-textPrimary">/crm</span>.
          </p>
        </div>
      </main>
    );
  }

  if (ready === false) {
    return (
      <main className="min-h-screen bg-background px-4 py-24">
        <div className="mx-auto max-w-md text-center">
          <h1 className="font-heading text-xl text-textPrimary">Setup unavailable</h1>
          <p className="mt-4 text-sm text-rose-300" role="alert">
            {err ?? "Something went wrong."}
          </p>
          {looksLikeDnsFailure(err) ? (
            <div className="mt-6 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-xs leading-relaxed text-textMuted">
              <p className="font-medium text-textPrimary/90">
                On Windows, the direct host <code className="text-sky-300/90">db.&lt;ref&gt;.supabase.co</code> often has{" "}
                <strong className="font-semibold text-textPrimary/95">IPv6 only</strong>. Node can report{" "}
                <code className="text-sky-300/90">ENOTFOUND</code> if IPv6 is not usable on your network — even though the project is fine.
              </p>
              <p className="mt-3 font-medium text-textPrimary/90">Fix (recommended): use the pooler URI instead</p>
              <ul className="mt-2 list-disc space-y-2 pl-4">
                <li>
                  Supabase → Project Settings → Database → <strong className="font-semibold">Connection pooling</strong> → copy the{" "}
                  <strong className="font-semibold">Session pooler</strong> connection string (host like{" "}
                  <code className="text-sky-300/90">aws-0-….pooler.supabase.com</code>, with the <code className="text-sky-300/90">postgres.[PROJECT-REF]</code>{" "}
                  username shown there).
                </li>
                <li>
                  In <code className="text-sky-300/90">.env.local</code>, set either <code className="text-sky-300/90">SUPABASE_DATABASE_POOLER_URL</code>{" "}
                  (recommended — app prefers it over <code className="text-sky-300/90">DATABASE_URL</code>) or replace <code className="text-sky-300/90">DATABASE_URL</code>{" "}
                  with that URI. Save, restart <code className="text-sky-300/90">npm run dev</code>, then Retry.
                </li>
                <li>Alternatively, fix IPv6 on the machine/router, or try another network — then the direct <code className="text-sky-300/90">db.*</code> host may work.</li>
              </ul>
            </div>
          ) : null}
          <div className="mt-8 flex flex-col gap-3 text-sm">
            <button
              type="button"
              className="vs-button-primary justify-center"
              onClick={() => {
                setReady(null);
                setErr(null);
                window.location.reload();
              }}
            >
              Retry
            </button>
            <Link href="/admin/login" className="text-sky-300 underline">
              Back to login
            </Link>
            <Link href="/crm" className="text-textMuted underline">
              CRM (requires login)
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-md">
        <p className="text-center font-heading text-lg font-semibold text-textPrimary">VantageStack</p>
        <h1 className="mt-4 font-heading text-2xl font-semibold text-textPrimary">Create first admin</h1>
        <p className="mt-2 text-sm text-textMuted">No super admin exists yet. This form runs once per environment.</p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="su-email" className="mb-1 block text-xs text-textMuted">
              Email <span className="text-rose-300">*</span>
            </label>
            <input
              id="su-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="vs-input"
              required
            />
          </div>
          <div>
            <label htmlFor="su-user" className="mb-1 block text-xs text-textMuted">
              Username <span className="text-rose-300">*</span>
            </label>
            <input
              id="su-user"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="vs-input"
              required
              minLength={3}
              maxLength={20}
            />
          </div>
          <PasswordField label="Password *" autoComplete="new-password" value={password} onChange={setPassword} required />
          <PasswordRequirements password={password} />
          <PasswordField
            label="Confirm password *"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            required
          />
          <div>
            <label htmlFor="su-name" className="mb-1 block text-xs text-textMuted">
              Full name (optional)
            </label>
            <input id="su-name" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="vs-input" />
          </div>
          <label className="flex items-start gap-2 text-sm text-textMuted">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1 rounded border-white/20" required />
            <span>I accept the terms of service</span>
          </label>
          {err ? (
            <p className="text-sm text-rose-300" role="alert">
              {err}
            </p>
          ) : null}
          <button type="submit" disabled={loading} className="vs-button-primary w-full justify-center disabled:opacity-50">
            {loading ? "Creating…" : "Create admin account"}
          </button>
        </form>
        <p className="mt-8 text-center text-sm">
          <Link href="/admin/login" className="text-textMuted underline">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
