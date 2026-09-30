import type { Permission, TeamRole } from "./roles";
import { can } from "./roles";

/** Consultant Portal root (pages live under it). */
export const CONSULTANT_HOME = "/consultant";
/** Signed-in home for everyone else. */
export const ADMIN_HOME = "/admin";

/**
 * Minimum permission required to open a **page** route (middleware).
 * API routes should call `requirePermission` for mutating handlers.
 */
export function pageRequiresPermission(pathname: string): Permission | null {
  if (pathname.startsWith("/admin/unauthorized")) return null;
  if (pathname.startsWith("/admin/login")) return null;
  if (pathname.startsWith("/admin/invite")) return null;

  if (pathname.startsWith("/admin/team")) return null; // handled via invite_team || manage_users

  if (pathname === CONSULTANT_HOME || pathname.startsWith(`${CONSULTANT_HOME}/`)) return "use_consultant_portal";

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

/**
 * Where a signed-in role lands by default (post-login and the /admin hub).
 * A role that can use the Consultant Portal but has no CRM access (sales_consultant)
 * has nothing to do in the admin hub, so it goes straight to the portal.
 */
export function homePathForRole(role: TeamRole): string {
  return can(role, "use_consultant_portal") && !can(role, "view_clients") ? CONSULTANT_HOME : ADMIN_HOME;
}
