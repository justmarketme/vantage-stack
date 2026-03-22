"use client";

import Link from "next/link";
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
          className={`mt-4 flex items-center justify-between rounded-full border border-white/10 bg-black/40 px-5 py-3 backdrop-blur ${
            scrolled ? "shadow-[0_18px_45px_rgba(0,0,0,0.65)]" : ""
          }`}
        >
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent text-xs font-semibold">
              VS
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-sm tracking-wide">
                VantageStack
              </span>
              <span className="text-[11px] uppercase tracking-[0.16em] text-textMuted">
                Revenue Systems
              </span>
            </div>
          </Link>
          <nav className="hidden items-center gap-8 text-xs md:flex text-textMuted">
            <Link href="/blueprint" className="hover:text-textPrimary transition">
              Blueprint
            </Link>
            <a href="#services" className="hover:text-textPrimary transition">
              Services
            </a>
            <a href="#revenue-system" className="hover:text-textPrimary transition">
              Revenue System™
            </a>
            <a href="#sa" className="hover:text-textPrimary transition">
              For South Africa
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/blueprint"
              className="vs-button-primary text-xs whitespace-nowrap"
            >
              Get Blueprint
            </Link>
          </div>
        </div>
      </div>
    </motion.header>
  );
}
