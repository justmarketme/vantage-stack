import type { Permission, TeamRole } from "./roles";
import { can, isReadOnlyPortalRole } from "./roles";

/** Consultant Portal root (pages live under it). */
export const CONSULTANT_HOME = "/consultant";
/** Signed-in home for everyone else. */
export const ADMIN_HOME = "/admin";

/** Consultant Portal admin views (wave 2). */
export const CONSULTANT_ADMIN = `${CONSULTANT_HOME}/admin`;
export const CONSULTANT_ADMIN_SYSTEMS = `${CONSULTANT_ADMIN}/systems`;
export const CONSULTANT_ADMIN_GROWTH = `${CONSULTANT_ADMIN}/growth`;

/** Opening the Growth view takes EITHER of these (checked in `roleMayAccessPage`). */
const GROWTH_PERMISSIONS: readonly Permission[] = ["manage_gamification", "view_team_performance"];
/** Any other `/consultant/admin/**` page takes any one of the oversight permissions. */
const PORTAL_ADMIN_PERMISSIONS: readonly Permission[] = ["view_system_health", ...GROWTH_PERMISSIONS];

function under(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Minimum permission required to open a **page** route (middleware).
 * API routes should call `requirePermission` for mutating handlers.
 */
export function pageRequiresPermission(pathname: string): Permission | null {
  if (pathname.startsWith("/admin/unauthorized")) return null;
  if (pathname.startsWith("/admin/login")) return null;
  if (pathname.startsWith("/admin/invite")) return null;

  if (pathname.startsWith("/admin/team")) return null; // handled via invite_team || manage_users

  if (under(pathname, CONSULTANT_ADMIN_SYSTEMS)) return "view_system_health";
  if (under(pathname, CONSULTANT_HOME)) return "use_consultant_portal";

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
  if (under(pathname, CONSULTANT_ADMIN) && !under(pathname, CONSULTANT_ADMIN_SYSTEMS)) {
    const anyOf = under(pathname, CONSULTANT_ADMIN_GROWTH) ? GROWTH_PERMISSIONS : PORTAL_ADMIN_PERMISSIONS;
    return can(role, "use_consultant_portal") && anyOf.some((p) => can(role, p));
  }
  const need = pageRequiresPermission(pathname);
  if (!need) return true;
  return can(role, need);
}

/**
 * Where a signed-in role lands by default (post-login and the /admin hub).
 * A role that can use the Consultant Portal but has no CRM access (sales_consultant, and the
 * read-only oversight roles systems_ops / acquisition_creative) has nothing to do in the
 * admin hub, so it goes straight to the portal.
 */
export function homePathForRole(role: TeamRole): string {
  return can(role, "use_consultant_portal") && !can(role, "view_clients") ? CONSULTANT_HOME : ADMIN_HOME;
}

/**
 * Portal API writes a READ-ONLY portal role (systems_ops, acquisition_creative) may send.
 * Middleware rejects every other POST/PUT/PATCH/DELETE under `/api/consultant/**` for those
 * roles, so a read-only manager can never claim, reassign, edit or call a lead even if a
 * handler only checks `isManager`. Each allowed route still enforces its own permission
 * (`requireConsultant({ permission })`); this list only decides what reaches the handler.
 */
const READ_ONLY_WRITE_ROUTES: readonly RegExp[] = [
  /^\/api\/consultant\/leads\/search$/, // POST, but a read (search body instead of ?q=)
  /^\/api\/consultant\/settings\/gamification$/, // manage_gamification
  /^\/api\/consultant\/rewards\/[^/]+\/fulfil$/, // manage_gamification
  /^\/api\/consultant\/admin\/dead-letters\/(event|message)\/[^/]+\/retry$/, // view_system_health
];

export function readOnlyPortalWriteAllowed(role: TeamRole, method: string, pathname: string): boolean {
  if (!isReadOnlyPortalRole(role)) return true;
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return true;
  return READ_ONLY_WRITE_ROUTES.some((re) => re.test(pathname));
}
