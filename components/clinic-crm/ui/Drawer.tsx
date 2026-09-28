"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "./Button";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** "right" = side sheet (details, forms); "bottom" = mobile action sheet. */
  side?: "right" | "bottom";
  footer?: ReactNode;
  children: ReactNode;
}

/** Modal sheet: focus-trapped, Esc closes, focus returns to the opener. */
export function Drawer({ open, onClose, title, description, side = "right", footer, children }: DrawerProps) {
  const [host, setHost] = useState<Element | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const reduce = useReducedMotion();

  // Portal into the themed root so tokens still apply outside the page's stacking context.
  useEffect(() => setHost(document.querySelector(".clinic-crm") ?? document.body), []);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current;
      first?.focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!host) return null;

  const offscreen = side === "right" ? { x: "100%" } : { y: "100%" };
  const onscreen = side === "right" ? { x: 0 } : { y: 0 };
  const transition = reduce ? { duration: 0 } : { type: "spring" as const, damping: 34, stiffness: 340 };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="cc-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="panel"
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-side={side}
            className="cc-drawer outline-none"
            initial={offscreen}
            animate={onscreen}
            exit={offscreen}
            transition={transition}
          >
            {side === "bottom" && <div className="mx-auto mt-2 h-1.5 w-10 rounded-full cc-surface-2" aria-hidden />}
            <header className="flex items-start gap-3 px-5 pt-4 pb-3">
              <div className="min-w-0 flex-1 pt-2">
                <h2 id={titleId} className="text-xl font-semibold leading-tight">
                  {title}
                </h2>
                {description && <p className="cc-muted mt-1 text-sm">{description}</p>}
              </div>
              <Button variant="ghost" iconOnly aria-label="Close" onClick={onClose}>
                <X size={20} aria-hidden />
              </Button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">{children}</div>
            {footer && <footer className="cc-divider flex flex-wrap justify-end gap-2 px-5 py-4">{footer}</footer>}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    host,
  );
}
