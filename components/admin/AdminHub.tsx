import Link from "next/link";
import { AdminNavbar } from "./AdminNavbar";
import { AdminLogoutButton } from "./AdminLogoutButton";
import { SessionWarning } from "./SessionWarning";

const links = [
  { href: "/crm", label: "CRM", description: "Morning briefings & ops" },
  { href: "/admin/team", label: "Team", description: "Members & invitations" },
  { href: "/scheduler", label: "Scheduler", description: "Cron jobs & last runs" },
  { href: "/analytics", label: "Analytics", description: "Business metrics" },
  { href: "/monitoring", label: "Monitoring", description: "Health & uptime" },
] as const;

/** Signed-in admin home: shortcuts to internal tools. */
export function AdminHub() {
  return (
    <div>
      <AdminNavbar />
      <main className="vs-container pt-28 pb-16">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-textMuted">Internal</p>
          <h1 className="mt-2 font-heading text-3xl tracking-tight text-textPrimary">Admin</h1>
          <p className="mt-2 text-sm text-textMuted">
            Shortcuts to internal tools. This area is not listed in the public site navigation.
          </p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2">
            {links.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-2xl border border-white/10 bg-black/30 p-5 transition hover:border-accent/50 hover:bg-black/40"
                >
                  <span className="font-heading text-lg text-textPrimary">{item.label}</span>
                  <span className="mt-1 block text-sm text-textMuted">{item.description}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-12">
            <AdminLogoutButton />
          </div>
        </div>
      </main>
      <SessionWarning />
    </div>
  );
}
