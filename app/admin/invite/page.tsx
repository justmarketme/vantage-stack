"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { PasswordField } from "../../../components/admin/PasswordField";
import { PasswordRequirements } from "../../../components/admin/PasswordRequirements";
import { checkPasswordPolicy, isValidUsername } from "../../../lib/auth/password-policy";

function InviteInner() {
  const sp = useSearchParams();
  const token = sp.get("t") || sp.get("token") || "";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fullName, setFullName] = useState("");
  const [terms, setTerms] = useState(false);
  const [err, setErr] = useState<string | null>(!token ? "Invalid invitation link." : null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailRo, setEmailRo] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let c = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/invite/info?t=${encodeURIComponent(token)}`);
        const j = (await res.json()) as { ok?: boolean; email?: string; username?: string; error?: string };
        if (c) return;
        if (!res.ok || !j.ok) {
          setErr(j.error ?? "Invitation has expired. Ask your admin for a new one.");
          return;
        }
        setEmailRo(j.email ?? null);
        if (j.username) setUsername(j.username);
      } catch {
        if (!c) setErr("Could not load invitation");
      }
    })();
    return () => {
      c = true;
    };
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!token) return;
    const u = username.trim();
    if (!isValidUsername(u)) {
      setErr("Username: 3–20 characters, letters, numbers, underscores only");
      return;
    }
    if (!checkPasswordPolicy(password).ok) {
      setErr("Password does not meet requirements");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match");
      return;
    }
    if (!terms) {
      setErr("Accept the terms of service");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invite/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          password,
          username: u,
          full_name: fullName.trim() || null,
          terms_accepted: true as const,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; verify_email_sent?: boolean };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "Could not complete signup");
        return;
      }
      setOk(true);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen bg-background px-4 py-24 text-center">
        <p className="text-rose-300">{err}</p>
        <Link href="/admin/login" className="mt-6 inline-block text-accent underline">
          Login
        </Link>
      </main>
    );
  }

  if (ok) {
    return (
      <main className="min-h-screen bg-background px-4 py-24 text-center">
        <h1 className="font-heading text-2xl text-textPrimary">You&apos;re in</h1>
        <p className="mt-4 text-textMuted">Check your email to verify your address, then log in.</p>
        <Link href="/admin/login" className="mt-8 inline-block text-accent underline">
          Go to login
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-16">
      <div className="mx-auto max-w-md">
        <h1 className="font-heading text-2xl text-textPrimary">Accept invitation</h1>
        <p className="mt-2 text-sm text-textMuted">Choose a password and confirm your username.</p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          {emailRo ? (
            <div>
              <label className="mb-1 block text-xs text-textMuted">Email</label>
              <input className="vs-input cursor-not-allowed opacity-80" readOnly value={emailRo} aria-readonly />
            </div>
          ) : null}
          <div>
            <label htmlFor="inv-user" className="mb-1 block text-xs text-textMuted">
              Username
            </label>
            <input id="inv-user" className="vs-input" value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} maxLength={20} />
          </div>
          <PasswordField label="Password" autoComplete="new-password" value={password} onChange={setPassword} required />
          <PasswordRequirements password={password} />
          <PasswordField label="Confirm password" autoComplete="new-password" value={confirm} onChange={setConfirm} required />
          <div>
            <label htmlFor="inv-name" className="mb-1 block text-xs text-textMuted">
              Full name (optional)
            </label>
            <input id="inv-name" className="vs-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <label className="flex items-start gap-2 text-sm text-textMuted">
            <input type="checkbox" className="mt-1 rounded border-white/20" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
            <span>I accept the terms of service</span>
          </label>
          {err ? (
            <p className="text-sm text-rose-300" role="alert">
              {err}
            </p>
          ) : null}
          <button type="submit" disabled={loading} className="vs-button-primary w-full justify-center disabled:opacity-50">
            {loading ? "Creating…" : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-4 py-24 text-center text-textMuted">
          Loading…
        </main>
      }
    >
      <InviteInner />
    </Suspense>
  );
}
