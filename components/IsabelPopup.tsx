"use client";

import { motion, AnimatePresence } from "framer-motion";

interface IsabelPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function IsabelPopup({ isOpen, onClose }: IsabelPopupProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md"
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-white/10 bg-surface p-6 shadow-[0_25px_60px_rgba(0,0,0,0.6)]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="isabel-popup-title"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-textMuted hover:bg-white/5 hover:text-textPrimary transition-colors"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex items-start gap-4 mb-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
                <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C2.95 22.5 0 19.55 0 16.5V6.257c0-1.655.967-3.113 2.437-3.757l.063-.063z" />
                </svg>
              </div>
              <div>
                <h3 id="isabel-popup-title" className="font-heading text-xl font-semibold text-textPrimary mb-1">
                  Talk to Isabel
                </h3>
                <p className="text-sm text-textMuted leading-relaxed">
                  Click the phone button in the bottom-right corner to start your voice conversation.
                </p>
              </div>
            </div>
            <button onClick={onClose} className="vs-button-primary w-full text-sm">
              Got it
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
