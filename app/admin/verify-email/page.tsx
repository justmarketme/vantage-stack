"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";

function VerifyInner() {
  const sp = useSearchParams();
  const token = sp.get("t") || sp.get("token") || "";
  const pending = sp.get("pending") === "1";
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      if (!pending) setMsg("Missing verification link.");
      return;
    }
    let c = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const j = (await res.json()) as { ok?: boolean; error?: string };
        if (c) return;
        if (!res.ok || !j.ok) {
          setMsg(j.error ?? "Verification failed");
          return;
        }
        setDone(true);
      } catch {
        if (!c) setMsg("Network error");
      }
    })();
    return () => {
      c = true;
    };
  }, [token, pending]);

  if (pending && !token) {
    return (
      <main className="min-h-screen bg-background px-4 py-24 text-center">
        <h1 className="font-heading text-2xl text-textPrimary">Check your email</h1>
        <p className="mt-4 text-textMuted">We sent a link to verify your account. After verifying, you can log in.</p>
        <Link href="/admin/login" className="mt-8 inline-block text-accent underline">
          Go to login
        </Link>
      </main>
    );
  }

  if (done) {
    return (
      <main className="min-h-screen bg-background px-4 py-24 text-center">
        <h1 className="font-heading text-2xl text-textPrimary">Email verified</h1>
        <Link href="/admin/login" className="mt-8 inline-block text-accent underline">
          Continue to login
        </Link>
      </main>
    );
  }

  if (msg) {
    return (
      <main className="min-h-screen bg-background px-4 py-24 text-center">
        <p className="text-rose-300">{msg}</p>
        <Link href="/admin/login" className="mt-8 inline-block text-accent underline">
          Login
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-24 text-center">
      <p className="text-textMuted">Verifying…</p>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background px-4 py-24 text-center">
          <p className="text-textMuted">Loading…</p>
        </main>
      }
    >
      <VerifyInner />
    </Suspense>
  );
}
