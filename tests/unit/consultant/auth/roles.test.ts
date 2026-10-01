import { can, permissionsFor, ROLE_LABELS, TEAM_ROLES, type Permission, type TeamRole } from "../../../../lib/admin/roles";
import {
  homePathForRole,
  pageRequiresPermission,
  readOnlyPortalWriteAllowed,
  roleMayAccessPage,
} from "../../../../lib/admin/rbac-paths";

describe("sales_consultant role", () => {
  it("exists with a human label", () => {
    expect(TEAM_ROLES).toContain("sales_consultant");
    expect(ROLE_LABELS.sales_consultant).toBe("Sales Consultant (Clinics)");
  });

  it("gets ONLY use_consultant_portal", () => {
    const perms = [
      "view_clients", "edit_clients", "generate_reports", "send_reports", "manage_users",
      "invite_team", "view_analytics", "manage_campaigns", "view_financial", "access_settings",
      "confirm_payments", "manage_gamification", "view_system_health", "view_team_performance",
    ] as const;
    for (const p of perms) expect(can("sales_consultant", p)).toBe(false);
    expect(can("sales_consultant", "use_consultant_portal")).toBe(true);
  });

  it("portal access is granted to exactly the spec'd roles", () => {
    const granted = TEAM_ROLES.filter((r) => can(r, "use_consultant_portal")).sort();
    expect(granted).toEqual(["acquisition_creative", "admin", "agent_manager", "sales_consultant", "super_admin", "systems_ops"]);
  });
});

describe("page RBAC", () => {
  it("/consultant pages need use_consultant_portal", () => {
    expect(pageRequiresPermission("/consultant")).toBe("use_consultant_portal");
    expect(pageRequiresPermission("/consultant/call/abc")).toBe("use_consultant_portal");
    expect(pageRequiresPermission("/consultants-info")).toBeNull();
  });

  it("a sales_consultant can open the portal but not the CRM", () => {
    expect(roleMayAccessPage("sales_consultant", "/consultant/pipeline")).toBe(true);
    expect(roleMayAccessPage("sales_consultant", "/crm")).toBe(false);
    expect(roleMayAccessPage("sales_consultant", "/crm/clients")).toBe(false);
    expect(roleMayAccessPage("sales_consultant", "/admin/team")).toBe(false);
  });

  it("CRM-only roles cannot open the portal", () => {
    for (const r of ["viewer", "report_generator", "client_success_manager"] as TeamRole[]) {
      expect(roleMayAccessPage(r, "/consultant")).toBe(false);
    }
  });

  it("post-login home: consultants + oversight roles → /consultant, everyone else → /admin", () => {
    const portalHome: TeamRole[] = ["sales_consultant", "systems_ops", "acquisition_creative"];
    for (const r of portalHome) expect(homePathForRole(r)).toBe("/consultant");
    for (const r of TEAM_ROLES.filter((x) => !portalHome.includes(x))) expect(homePathForRole(r)).toBe("/admin");
  });

  it("/consultant/admin/systems needs view_system_health", () => {
    expect(pageRequiresPermission("/consultant/admin/systems")).toBe("view_system_health");
    expect(roleMayAccessPage("systems_ops", "/consultant/admin/systems")).toBe(true);
    expect(roleMayAccessPage("admin", "/consultant/admin/systems/dead-letters")).toBe(true);
    for (const r of ["acquisition_creative", "agent_manager", "sales_consultant"] as TeamRole[]) {
      expect(roleMayAccessPage(r, "/consultant/admin/systems")).toBe(false);
    }
  });

  it("/consultant/admin/growth needs manage_gamification OR view_team_performance", () => {
    for (const r of ["acquisition_creative", "agent_manager", "admin", "super_admin"] as TeamRole[]) {
      expect(roleMayAccessPage(r, "/consultant/admin/growth")).toBe(true);
    }
    for (const r of ["systems_ops", "sales_consultant", "viewer"] as TeamRole[]) {
      expect(roleMayAccessPage(r, "/consultant/admin/growth")).toBe(false);
    }
  });

  it("/consultant/admin (hub) needs any oversight permission; consultants are kept out", () => {
    expect(roleMayAccessPage("systems_ops", "/consultant/admin")).toBe(true);
    expect(roleMayAccessPage("acquisition_creative", "/consultant/admin")).toBe(true);
    expect(roleMayAccessPage("sales_consultant", "/consultant/admin")).toBe(false);
    expect(roleMayAccessPage("sales_consultant", "/consultant/administer")).toBe(true); // not under /admin
  });
});

describe("wave 2 roles + permissions (seam: exact grants)", () => {
  const NEW: Permission[] = ["confirm_payments", "manage_gamification", "view_system_health", "view_team_performance"];
  const grants = (r: TeamRole) => NEW.filter((p) => can(r, p));

  it("labels", () => {
    expect(ROLE_LABELS.systems_ops).toBe("Systems & Operations");
    expect(ROLE_LABELS.acquisition_creative).toBe("Acquisition & Creative Direction");
  });

  it("grants exactly per the seam", () => {
    expect(grants("super_admin")).toEqual(NEW);
    expect(grants("admin")).toEqual(NEW);
    expect(grants("agent_manager")).toEqual(["confirm_payments", "view_team_performance"]);
    expect(grants("sales_consultant")).toEqual([]);
    expect(grants("systems_ops")).toEqual(["view_system_health"]);
    expect(grants("acquisition_creative")).toEqual(["manage_gamification", "view_team_performance"]);
    for (const r of ["viewer", "report_generator", "client_success_manager"] as TeamRole[]) expect(grants(r)).toEqual([]);
  });

  it("oversight roles open the portal but never the CRM", () => {
    for (const r of ["systems_ops", "acquisition_creative"] as TeamRole[]) {
      expect(permissionsFor(r)).toContain("use_consultant_portal");
      expect(can(r, "view_clients")).toBe(false);
      expect(roleMayAccessPage(r, "/crm")).toBe(false);
    }
  });

  it("read-only portal roles may only send the permissioned admin writes", () => {
    for (const r of ["systems_ops", "acquisition_creative"] as TeamRole[]) {
      expect(readOnlyPortalWriteAllowed(r, "GET", "/api/consultant/leads")).toBe(true);
      expect(readOnlyPortalWriteAllowed(r, "POST", "/api/consultant/leads/search")).toBe(true);
      expect(readOnlyPortalWriteAllowed(r, "PUT", "/api/consultant/settings/gamification")).toBe(true);
      expect(readOnlyPortalWriteAllowed(r, "POST", "/api/consultant/rewards/abc/fulfil")).toBe(true);
      expect(readOnlyPortalWriteAllowed(r, "POST", "/api/consultant/admin/dead-letters/event/abc/retry")).toBe(true);
      expect(readOnlyPortalWriteAllowed(r, "POST", "/api/consultant/leads")).toBe(false);
      expect(readOnlyPortalWriteAllowed(r, "PATCH", "/api/consultant/leads/abc")).toBe(false);
      expect(readOnlyPortalWriteAllowed(r, "POST", "/api/consultant/leads/abc/claim")).toBe(false);
      expect(readOnlyPortalWriteAllowed(r, "POST", "/api/consultant/deals/abc/payment")).toBe(false);
      expect(readOnlyPortalWriteAllowed(r, "POST", "/api/consultant/leads/import")).toBe(false);
      expect(readOnlyPortalWriteAllowed(r, "POST", "/api/consultant/admin/dead-letters/other/abc/retry")).toBe(false);
    }
    expect(readOnlyPortalWriteAllowed("sales_consultant", "POST", "/api/consultant/leads")).toBe(true);
    expect(readOnlyPortalWriteAllowed("agent_manager", "PATCH", "/api/consultant/leads/abc")).toBe(true);
  });
});
