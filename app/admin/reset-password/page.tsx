"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";
import { PasswordField } from "../../../components/admin/PasswordField";
import { PasswordRequirements } from "../../../components/admin/PasswordRequirements";
import { checkPasswordPolicy } from "../../../lib/auth/password-policy";

function ResetInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("t") || sp.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(!token ? "Password reset link has expired. Request a new one." : null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!checkPasswordPolicy(password).ok) {
      setErr("Password does not meet requirements");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords must match");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? "Reset failed");
        return;
      }
      router.replace("/admin/login?msg=password-reset");
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
        <Link href="/admin/forgot-password" className="mt-6 inline-block text-accent underline">
          Request new link
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-24">
      <div className="mx-auto max-w-sm">
        <h1 className="font-heading text-2xl text-textPrimary">Reset password</h1>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <PasswordField label="New password" autoComplete="new-password" value={password} onChange={setPassword} required />
          <PasswordRequirements password={password} />
          <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={setConfirm} required />
          {err ? (
            <p className="text-sm text-rose-300" role="alert">
              {err}
            </p>
          ) : null}
          <button type="submit" disabled={loading} className="vs-button-primary w-full justify-center disabled:opacity-50">
            {loading ? "Saving…" : "Reset password"}
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

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-4 py-24 text-center">
          <p className="text-textMuted">Loading…</p>
        </main>
      }
    >
      <ResetInner />
    </Suspense>
  );
}
