import { can, ROLE_LABELS, TEAM_ROLES, type TeamRole } from "../../../../lib/admin/roles";
import { homePathForRole, pageRequiresPermission, roleMayAccessPage } from "../../../../lib/admin/rbac-paths";

describe("sales_consultant role", () => {
  it("exists with a human label", () => {
    expect(TEAM_ROLES).toContain("sales_consultant");
    expect(ROLE_LABELS.sales_consultant).toBe("Sales Consultant (Clinics)");
  });

  it("gets ONLY use_consultant_portal", () => {
    const perms = [
      "view_clients", "edit_clients", "generate_reports", "send_reports", "manage_users",
      "invite_team", "view_analytics", "manage_campaigns", "view_financial", "access_settings",
    ] as const;
    for (const p of perms) expect(can("sales_consultant", p)).toBe(false);
    expect(can("sales_consultant", "use_consultant_portal")).toBe(true);
  });

  it("portal access is granted to exactly the spec'd roles", () => {
    const granted = TEAM_ROLES.filter((r) => can(r, "use_consultant_portal")).sort();
    expect(granted).toEqual(["admin", "agent_manager", "sales_consultant", "super_admin"]);
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

  it("post-login home: consultants → /consultant, everyone else → /admin", () => {
    expect(homePathForRole("sales_consultant")).toBe("/consultant");
    for (const r of TEAM_ROLES.filter((x) => x !== "sales_consultant")) expect(homePathForRole(r)).toBe("/admin");
  });
});
