"use client";

import { useId, useState } from "react";

type Props = {
  label: string;
  autoComplete?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  id?: string;
};

export function PasswordField({ label, autoComplete = "current-password", value, onChange, required, id: idProp }: Props) {
  const gen = useId();
  const id = idProp ?? gen;
  const [show, setShow] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-textMuted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="vs-input pr-11"
          required={required}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-textMuted hover:bg-white/5 hover:text-textPrimary"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M3 3l18 18M10.5 10.5a3 3 0 004 4M9.88 9.88a3 3 0 104.24 4.24" />
              <path d="M6.34 6.34A9.9 9.9 0 0112 5c4 0 7.33 2.33 9 5-.67 1-1.5 1.93-2.48 2.74M12 19c-4 0-7.33-2.33-9-5 1-1.5 2.17-2.78 3.52-3.75" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
