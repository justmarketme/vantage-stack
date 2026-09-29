"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Toast state only — Agent 1's `<Toast>` component renders `toasts` and calls
 * `dismiss`. Never put patient details in a toast (they can be screenshotted
 * over the reception desk); say "Message sent", not "Message sent to Thandi".
 */

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export const TOAST_CONFIG = {
  max: 4,
  durationMs: { info: 4000, success: 3500, warning: 6000, error: 7000 } as Record<ToastKind, number>,
} as const;

export interface ToastContextValue {
  toasts: ToastItem[];
  /** Returns the toast id. `durationMs: 0` keeps it until dismissed. */
  show: (message: string, kind?: ToastKind, opts?: { durationMs?: number }) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    (message, kind = "info", opts = {}) => {
      const id = nextId.current++;
      setToasts((list) => {
        const next = [...list, { id, message: String(message), kind }];
        for (const dropped of next.slice(0, Math.max(0, next.length - TOAST_CONFIG.max))) {
          const t = timers.current.get(dropped.id);
          if (t) clearTimeout(t);
          timers.current.delete(dropped.id);
        }
        return next.slice(-TOAST_CONFIG.max);
      });
      const ms = opts.durationMs ?? TOAST_CONFIG.durationMs[kind];
      if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms));
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ClinicProviders>");
  return ctx;
}
