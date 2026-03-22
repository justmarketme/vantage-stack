"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { PasswordField } from "../../../components/admin/PasswordField";
import { PasswordRequirements } from "../../../components/admin/PasswordRequirements";
import { checkPasswordPolicy, isValidUsername } from "../../../lib/auth/password-policy";

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

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/setup");
        const j = (await r.json()) as { needs_setup?: boolean; ok?: boolean };
        if (c) return;
        if (!j.ok || !j.needs_setup) {
          router.replace("/admin/login");
          return;
        }
        setReady(true);
      } catch {
        if (!c) setErr("Could not load setup status");
      }
    })();
    return () => {
      c = true;
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
      router.replace("/admin/verify-email?pending=1");
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (ready === null) {
    return (
      <main className="min-h-screen bg-background px-4 py-24">
        <p className="text-center text-sm text-textMuted">Loading…</p>
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
