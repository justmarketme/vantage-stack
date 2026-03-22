import type { Permission, TeamRole } from "./roles";
import { can } from "./roles";

/**
 * Minimum permission required to open a **page** route (middleware).
 * API routes should call `requirePermission` for mutating handlers.
 */
export function pageRequiresPermission(pathname: string): Permission | null {
  if (pathname.startsWith("/admin/unauthorized")) return null;
  if (pathname.startsWith("/admin/login")) return null;
  if (pathname.startsWith("/admin/invite")) return null;

  if (pathname.startsWith("/admin/team")) return null; // handled via invite_team || manage_users

  if (!pathname.startsWith("/crm")) return null;

  if (pathname.match(/\/crm\/reports\/[^/]+\/review/)) return "send_reports";
  if (pathname === "/crm/clients/new" || pathname.includes("/crm/clients/") && pathname.endsWith("/edit")) {
    return "edit_clients";
  }

  if (pathname.includes("/crm/analytics") || pathname.includes("revenue")) return "view_financial";

  return "view_clients";
}

export function roleMayAccessPage(role: TeamRole, pathname: string): boolean {
  if (pathname.startsWith("/admin/team")) {
    return can(role, "manage_users") || can(role, "invite_team");
  }
  const need = pageRequiresPermission(pathname);
  if (!need) return true;
  return can(role, need);
}
