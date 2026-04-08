"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

const adminLinks = [
  { href: "/crm", label: "CRM" },
  { href: "/admin/team", label: "Team" },
  { href: "/scheduler", label: "Scheduler" },
  { href: "/analytics", label: "Analytics" },
  { href: "/monitoring", label: "Monitoring" },
] as const;

export function AdminNavbar() {
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-x-0 top-0 z-40"
    >
      <div className="vs-container">
        <div className="mt-4 flex items-center justify-between rounded-full border border-white/10 bg-black/40 px-5 py-3 backdrop-blur">
          <Link href="/admin" className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-accent text-xs font-semibold">
              VS
            </div>
            <div className="flex flex-col">
              <span className="font-heading text-sm tracking-wide">VantageStack</span>
              <span className="text-[11px] uppercase tracking-[0.16em] text-textMuted">Admin</span>
            </div>
          </Link>
          <nav className="hidden items-center gap-8 text-xs md:flex text-textMuted">
            {adminLinks.map((link) => {
              const active = pathname === link.href || pathname.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition ${active ? "text-textPrimary font-medium" : "hover:text-textPrimary"}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-textMuted hover:border-white/25 hover:text-textPrimary transition"
          >
            ← Back to site
          </Link>
        </div>
      </div>
    </motion.header>
  );
}
