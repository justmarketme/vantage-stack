"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { api } from "@/lib/clinic-crm/client/api";
import { useSession } from "@/components/clinic-crm/providers/SessionProvider";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { BASE } from "./AppShell";
import { errorStatus } from "./errors";

export function LoginView() {
  const router = useRouter();
  const { refresh } = useSession();
  const reduce = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api.auth.login({ email, password });
      await refresh();
      router.replace(BASE);
    } catch (err) {
      // Deliberately generic: never reveal whether the email exists.
      setError(
        errorStatus(err) === 429
          ? "Too many attempts. Please wait a few minutes and try again."
          : "We couldn't sign you in. Check your email and password and try again.",
      );
      setPending(false);
    }
  };

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
        className="w-full max-w-[400px]"
      >
        <div className="mb-8 text-center">
          <span
            className="cc-heading mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl text-base font-bold text-white"
            style={{ background: "linear-gradient(135deg,#3B82F6,#1D4ED8)" }}
            aria-hidden
          >
            VS
          </span>
          <h1 className="text-[30px] font-semibold leading-tight">Welcome back</h1>
          <p className="cc-muted mt-2 text-sm">Sign in to your clinic’s workspace.</p>
        </div>

        <form onSubmit={submit} className="cc-card flex flex-col gap-4 p-6" noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p className="cc-notice" data-tone="danger" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" loading={pending} disabled={!email || !password} className="mt-1 w-full">
            Sign in
          </Button>
        </form>

        <p className="cc-muted mt-6 flex items-center justify-center gap-2 text-xs">
          <Lock size={14} aria-hidden /> Patient data is protected under POPIA.
        </p>
      </motion.div>
    </main>
  );
}
