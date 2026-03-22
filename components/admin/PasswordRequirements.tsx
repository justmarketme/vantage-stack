"use client";

import { checkPasswordPolicy } from "../../lib/auth/password-policy";

export function PasswordRequirements({ password }: { password: string }) {
  const c = checkPasswordPolicy(password);
  const items = [
    { ok: c.minLen, label: "At least 12 characters" },
    { ok: c.upper, label: "One uppercase letter" },
    { ok: c.lower, label: "One lowercase letter" },
    { ok: c.digit, label: "One number" },
    { ok: c.special, label: "One special character (!@#$%^&*)" },
  ];
  return (
    <ul className="mt-2 space-y-1 text-xs text-textMuted" aria-live="polite">
      {items.map((it) => (
        <li key={it.label} className={it.ok ? "text-emerald-400/90" : ""}>
          {it.ok ? "✓ " : "○ "}
          {it.label}
        </li>
      ))}
    </ul>
  );
}
