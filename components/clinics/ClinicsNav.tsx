"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * Clinics header.
 *
 * Reuses the main site's floating-pill treatment and the same
 * `vs-logo-premium` asset so this reads as Vantage Stack rather than a
 * lookalike microsite — but carries clinic-specific anchors and a single CTA.
 *
 * The transparent logo with the LIGHT wordmark is the correct one here; the
 * navy-on-transparent variant disappears entirely against #0B0B0C.
 */
export function ClinicsNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-40">
      <div className="vs-container">
        <div
          className={`mt-4 flex items-center justify-between rounded-full border border-white/10 bg-black/50 px-4 py-2 backdrop-blur transition-shadow duration-300 sm:px-5 sm:py-2.5 ${
            scrolled ? "shadow-[0_18px_45px_rgba(0,0,0,0.65)]" : ""
          }`}
        >
          {/* Sub-brand lockup: the existing wordmark, a hairline rule, then
              "Clinics". Built as a lockup rather than a new logo file so the
              mark stays vector-crisp at every size and there is only ever one
              logo asset to maintain. The divider is what makes it read as
              "Vantage Stack ▸ Clinics" rather than two unrelated words. */}
          <Link
            href="/"
            className="flex flex-shrink-0 items-center gap-2.5 sm:gap-3"
            aria-label="Vantage Stack Clinics — home"
          >
            <Image
              src="/images/vs-logo-premium.png"
              alt="Vantage Stack"
              width={861}
              height={232}
              priority
              className="h-7 w-auto object-contain sm:h-12"
            />
            <span aria-hidden className="h-4 w-px bg-white/15 sm:h-7" />
            <span className="font-heading text-sm font-medium leading-none tracking-tight text-textPrimary sm:text-xl">
              Clinics
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-xs text-textMuted md:flex">
            <a href="#problem" className="transition hover:text-textPrimary">
              The problem
            </a>
            <a href="#system" className="transition hover:text-textPrimary">
              The system
            </a>
            <a href="#roi" className="transition hover:text-textPrimary">
              ROI
            </a>
            <a href="#book" className="transition hover:text-textPrimary">
              Book
            </a>
          </nav>

          <a
            href="#book"
            className="vs-button-primary flex-shrink-0 !px-3 !py-2 !text-xs sm:!px-5 sm:!text-sm"
          >
            {/* Full label from sm up; just "Demo" on the narrowest phones, where
                the lockup + full label overflow the pill. */}
            <span className="sm:hidden">Demo</span>
            <span className="hidden sm:inline">Book a demo</span>
          </a>
        </div>
      </div>
    </header>
  );
}
