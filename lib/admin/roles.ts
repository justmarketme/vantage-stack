/** Role keys stored in DB and session token (v2). */
export const TEAM_ROLES = [
  "super_admin",
  "admin",
  "agent_manager",
  "report_generator",
  "client_success_manager",
  "viewer",
  "sales_consultant",
  /** Consultant Portal oversight: API/n8n health + dead letters. Read-only in the portal. */
  "systems_ops",
  /** Consultant Portal oversight: pipeline velocity, gamification + rewards. Read-only in the portal. */
  "acquisition_creative",
] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export function isTeamRole(s: string): s is TeamRole {
  return (TEAM_ROLES as readonly string[]).includes(s);
}

/** Fine-grained permissions for RBAC checks. */
export type Permission =
  | "view_clients"
  | "edit_clients"
  | "generate_reports"
  | "send_reports"
  | "manage_users"
  | "invite_team"
  | "view_analytics"
  | "manage_campaigns"
  | "view_financial"
  | "access_settings"
  /** Open the Consultant Portal (/consultant) and its API; members with it may place calls. */
  | "use_consultant_portal"
  /** Confirm a clinic's payment (proof-of-payment upload) — moves a deal to `paid`. */
  | "confirm_payments"
  /** Edit gamification settings (targets, tiers, points) and fulfil rewards. */
  | "manage_gamification"
  /** Consultant Portal Systems view: health, event/message dead letters + retry. */
  | "view_system_health"
  /** Team-wide funnel metrics and pipeline velocity. */
  | "view_team_performance";

const ALL_PERMS: Permission[] = [
  "view_clients",
  "edit_clients",
  "generate_reports",
  "send_reports",
  "manage_users",
  "invite_team",
  "view_analytics",
  "manage_campaigns",
  "view_financial",
  "access_settings",
  "use_consultant_portal",
  "confirm_payments",
  "manage_gamification",
  "view_system_health",
  "view_team_performance",
];

/**
 * Roles that open the Consultant Portal as READ-ONLY managers: they see every Clinics lead and
 * the team's numbers but never place calls or write pipeline data (see `consultantFlags` and
 * `readOnlyPortalWriteAllowed` in rbac-paths.ts). Their only writes are the permissioned admin
 * actions their extra permission unlocks.
 */
export const READ_ONLY_PORTAL_ROLES: readonly TeamRole[] = ["systems_ops", "acquisition_creative"];

export function isReadOnlyPortalRole(role: TeamRole): boolean {
  return READ_ONLY_PORTAL_ROLES.includes(role);
}

function set(perms: Permission[]): Record<Permission, boolean> {
  const o = {} as Record<Permission, boolean>;
  for (const p of ALL_PERMS) o[p] = perms.includes(p);
  return o;
}

/** Permissions matrix per product spec. */
export const ROLE_PERMISSIONS: Record<TeamRole, Record<Permission, boolean>> = {
  super_admin: set(ALL_PERMS),
  admin: set([
    "view_clients",
    "edit_clients",
    "generate_reports",
    "send_reports",
    "invite_team",
    "view_analytics",
    "manage_campaigns",
    "view_financial",
    "use_consultant_portal",
    "confirm_payments",
    "manage_gamification",
    "view_system_health",
    "view_team_performance",
  ]),
  agent_manager: set([
    "view_clients",
    "edit_clients",
    "generate_reports",
    "send_reports",
    "view_analytics",
    "manage_campaigns",
    "view_financial",
    "use_consultant_portal",
    "confirm_payments",
    "view_team_performance",
  ]),
  report_generator: set(["view_clients", "edit_clients", "generate_reports", "view_analytics"]),
  client_success_manager: set(["view_clients", "edit_clients", "view_analytics", "manage_campaigns"]),
  viewer: set(["view_clients", "view_analytics"]),
  // Commission-based clinic sales. Deliberately NO view_clients: a consultant reaches CRM
  // data only through the scoped Consultant Portal API (own leads + unassigned pool).
  sales_consultant: set(["use_consultant_portal"]),
  // Leaders are given these via the admin team UI (data, not code). No view_clients: the CRM
  // stays closed; inside the portal they are read-only managers (isReadOnlyPortalRole).
  systems_ops: set(["use_consultant_portal", "view_system_health"]),
  acquisition_creative: set(["use_consultant_portal", "manage_gamification", "view_team_performance"]),
};

export function can(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.[permission] === true;
}

/** Every permission the role holds, in `ALL_PERMS` order (for session payloads / UI gating). */
export function permissionsFor(role: TeamRole): Permission[] {
  return ALL_PERMS.filter((p) => can(role, p));
}

/** Human-readable labels for UI. */
export const ROLE_LABELS: Record<TeamRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  agent_manager: "Agent Manager",
  report_generator: "Report Generator",
  client_success_manager: "Client Success Manager",
  viewer: "Viewer",
  sales_consultant: "Sales Consultant (Clinics)",
  systems_ops: "Systems & Operations",
  acquisition_creative: "Acquisition & Creative Direction",
};

/** Markdown matrix for team page documentation. */
export const PERMISSION_MATRIX_MD = `
| Capability | Super Admin | Admin | Agent Manager | Report Generator | CSM | Viewer | Sales Consultant | Systems & Ops | Acquisition & Creative |
|------------|------------|-------|---------------|------------------|-----|--------|------------------|---------------|------------------------|
| View clients | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Edit clients | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Generate reports | ✓ | ✓ | ✓ | ✓ | — | — | — | — | — |
| Send reports | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Manage users | ✓ | — | — | — | — | — | — | — | — |
| View analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Manage campaigns | ✓ | ✓ | ✓ | — | ✓ | — | — | — | — |
| View financial data | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Access settings | ✓ | — | — | — | — | — | — | — | — |
| Consultant Portal | ✓ | ✓ | ✓ | — | — | — | ✓ | read-only | read-only |
| Confirm payments | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Manage gamification | ✓ | ✓ | — | — | — | — | — | — | ✓ |
| View system health | ✓ | ✓ | — | — | — | — | — | ✓ | — |
| View team performance | ✓ | ✓ | ✓ | — | — | — | — | — | ✓ |
`.trim();
