/** Role keys stored in DB and session token (v2). */
export const TEAM_ROLES = [
  "super_admin",
  "admin",
  "agent_manager",
  "report_generator",
  "client_success_manager",
  "viewer",
  "sales_consultant",
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
  | "use_consultant_portal";

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
];

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
  ]),
  report_generator: set(["view_clients", "edit_clients", "generate_reports", "view_analytics"]),
  client_success_manager: set(["view_clients", "edit_clients", "view_analytics", "manage_campaigns"]),
  viewer: set(["view_clients", "view_analytics"]),
  // Commission-based clinic sales. Deliberately NO view_clients: a consultant reaches CRM
  // data only through the scoped Consultant Portal API (own leads + unassigned pool).
  sales_consultant: set(["use_consultant_portal"]),
};

export function can(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.[permission] === true;
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
};

/** Markdown matrix for team page documentation. */
export const PERMISSION_MATRIX_MD = `
| Capability | Super Admin | Admin | Agent Manager | Report Generator | CSM | Viewer | Sales Consultant |
|------------|------------|-------|---------------|------------------|-----|--------|------------------|
| View clients | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Edit clients | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| Generate reports | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Send reports | ✓ | ✓ | ✓ | — | — | — | — |
| Manage users | ✓ | — | — | — | — | — | — |
| View analytics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Manage campaigns | ✓ | ✓ | ✓ | — | ✓ | — | — |
| View financial data | ✓ | ✓ | ✓ | — | — | — | — |
| Access settings | ✓ | — | — | — | — | — | — |
| Consultant Portal | ✓ | ✓ | ✓ | — | — | — | ✓ |
`.trim();
