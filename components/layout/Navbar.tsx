"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-40"
    >
      <div className="vs-container">
        <div
          className={`mt-4 flex items-center justify-between rounded-full border border-white/10 bg-black/40 px-4 py-2 sm:px-5 sm:py-3 backdrop-blur ${
            scrolled ? "shadow-[0_18px_45px_rgba(0,0,0,0.65)]" : ""
          }`}
        >
          <Link href="/" className="flex items-center flex-shrink-0">
            <Image
              src="/images/vs-logo-premium.png"
              alt="VantageStack"
              width={861}
              height={232}
              className="h-12 w-auto object-contain sm:h-20"
              priority
            />
          </Link>
          <nav className="hidden items-center gap-8 text-xs md:flex text-textMuted">
            <a href="#blueprint" className="hover:text-textPrimary transition">
              Blueprint
            </a>
            <a href="#services" className="hover:text-textPrimary transition">
              Services
            </a>
            <a href="#revenue-system" className="hover:text-textPrimary transition">
              Revenue System™
            </a>
          </nav>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href="#blueprint"
              className="inline-flex items-center justify-center rounded-full bg-accent text-white font-medium transition-all duration-200 ease-out hover:bg-accent/90 hover:shadow-[0_0_24px_rgba(56,189,248,0.65)] hover:-translate-y-[1px] active:translate-y-0 whitespace-nowrap px-4 py-2 text-xs sm:px-6 sm:py-3 sm:text-sm"
            >
              Get Blueprint
            </a>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
