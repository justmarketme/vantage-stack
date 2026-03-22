"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/crm", label: "Overview" },
  { href: "/crm/clients", label: "Clients" },
  { href: "/crm/clients/new", label: "Add client" },
];

export function CrmSubnav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-2 border-b border-white/10 pb-4" aria-label="CRM sections">
      {links.map((l) => {
        const active = pathname === l.href || (l.href !== "/crm" && pathname.startsWith(l.href));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={[
              "rounded-full border px-4 py-2 text-xs font-semibold transition",
              active ? "border-sky-500/30 bg-sky-500/10 text-sky-200" : "border-white/10 bg-white/5 text-textMuted hover:bg-white/10",
            ].join(" ")}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
