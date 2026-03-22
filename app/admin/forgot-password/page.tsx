"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() }),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setErr(j.error ?? "Request failed");
        return;
      }
      setSent(true);
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-24">
      <div className="mx-auto max-w-sm">
        <h1 className="font-heading text-2xl text-textPrimary">Forgot password</h1>
        {sent ? (
          <p className="mt-4 text-sm text-textMuted">Check your email for password reset instructions.</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="fp-id" className="mb-1 block text-xs text-textMuted">
                Username or email
              </label>
              <input
                id="fp-id"
                type="text"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="vs-input"
                autoComplete="username"
              />
            </div>
            {err ? <p className="text-sm text-rose-300">{err}</p> : null}
            <button type="submit" disabled={loading} className="vs-button-primary w-full justify-center disabled:opacity-50">
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="mt-8 text-center text-sm">
          <Link href="/admin/login" className="text-textMuted underline">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
