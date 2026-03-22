export function statusBadgeClass(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "churned") return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  if (s === "active-client") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (s === "report-sent") return "border-amber-500/40 bg-amber-500/10 text-amber-100";
  if (s === "proposal-sent" || s === "upsell-sent") return "border-violet-500/35 bg-violet-500/10 text-violet-100";
  if (s === "manually-added" || s === "blueprint-submitted") return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  return "border-white/15 bg-white/[0.04] text-textMuted";
}
