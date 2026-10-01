"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cx, FOCUS } from "./utils";

/**
 * Bottom sheet on phones, centred dialog on ≥1024px. Modal: focus moves in on
 * open and back to the trigger on close; Escape closes when `onClose` is given.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>("textarea, input, select, button:not([data-sheet-close])");
      (first ?? panel.current)?.focus();
    }, 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current?.();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      returnTo.current?.focus?.();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div key="sheet" className="fixed inset-0 z-[60] flex items-end justify-center lg:items-center">
          <motion.div
            className="absolute inset-0 bg-[--cp-scrim]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            transition={{ duration: reduce ? 0.12 : 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className={cx(
              "relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl border border-[--cp-border-strong] bg-[--cp-bg] outline-none lg:rounded-3xl",
              wide ? "lg:max-w-2xl" : "lg:max-w-lg",
            )}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[--cp-surface-3] lg:hidden" aria-hidden />
            <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-3">
              <h2 id={titleId} className="font-heading text-lg font-medium text-[--cp-text]">
                {title}
              </h2>
              {onClose && (
                <button
                  type="button"
                  data-sheet-close
                  onClick={onClose}
                  aria-label="Close"
                  className={cx("-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-xl text-[--cp-muted] hover:text-[--cp-text]", FOCUS)}
                >
                  <X size={20} aria-hidden />
                </button>
              )}
            </header>
            <div className="cp-scroll-y min-h-0 flex-1 px-5 pb-4">{children}</div>
            {footer && (
              <footer className="border-t border-[--cp-border] px-5 pt-3" style={{ paddingBottom: "calc(0.75rem + var(--cp-safe-bottom))" }}>
                {footer}
              </footer>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
