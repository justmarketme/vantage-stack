export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-black/60">
      <div className="vs-container py-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between text-xs text-textMuted">
        <p>© {new Date().getFullYear()} VantageStack. All rights reserved.</p>
        <p className="text-[11px] uppercase tracking-[0.16em]">
          Business optimization & revenue systems.
        </p>
      </div>
    </footer>
  );
}
