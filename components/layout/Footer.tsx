import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black/60">
      <div className="vs-container py-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between text-xs text-textMuted">
        <p>© {new Date().getFullYear()} VantageStack. All rights reserved.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/crm" className="text-sky-300/90 hover:text-sky-200 transition">
            CRM dashboard
          </Link>
          <span className="text-white/20 hidden sm:inline">·</span>
          <p className="text-[11px] uppercase tracking-[0.16em]">
            Business optimization & revenue systems.
          </p>
        </div>
      </div>
    </footer>
  );
}
