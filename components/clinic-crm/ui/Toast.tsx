"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useToast, type ToastKind } from "@/components/clinic-crm/providers/ToastProvider";

const ICON: Record<ToastKind, typeof Info> = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error: TriangleAlert,
};

/** Renders the ToastProvider queue. Mount once, inside ClinicProviders. */
export function Toaster() {
  const { toasts, dismiss } = useToast();
  const reduce = useReducedMotion();
  return (
    <div className="cc-toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => {
          const Icon = ICON[t.kind];
          return (
            <motion.div
              key={t.id}
              layout={!reduce}
              initial={{ opacity: 0, y: reduce ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="cc-toast"
              data-kind={t.kind}
            >
              <Icon size={18} aria-hidden className="mt-px shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="-m-1 p-1 opacity-70">
                <X size={16} aria-hidden />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
