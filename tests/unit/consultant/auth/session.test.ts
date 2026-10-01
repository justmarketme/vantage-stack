// consultantFlags is pure; stub the cookie/JWT/DB plumbing requireConsultant pulls in.
jest.mock("../../../../lib/admin/api-auth", () => ({}));
jest.mock("../../../../lib/admin/session", () => ({}));
jest.mock("../../../../lib/crm/db", () => ({}));

import { consultantFlags } from "../../../../lib/consultant/auth/session";

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

describe("consultantFlags", () => {
  it("sales_consultant member: can call, not a manager", () => {
    expect(consultantFlags("sales_consultant", ID)).toEqual({ canCall: true, isManager: false });
  });
  it("agent_manager member: can call and manages", () => {
    expect(consultantFlags("agent_manager", ID)).toEqual({ canCall: true, isManager: true });
  });
  it("legacy admin (no member id): read-only manager", () => {
    expect(consultantFlags("super_admin", null)).toEqual({ canCall: false, isManager: true });
  });
  it("viewer: has view_clients but cannot call (requireConsultant still 403s it)", () => {
    expect(consultantFlags("viewer", ID)).toEqual({ canCall: false, isManager: true });
  });
  it("systems_ops / acquisition_creative members: read-only managers (never call)", () => {
    expect(consultantFlags("systems_ops", ID)).toEqual({ canCall: false, isManager: true });
    expect(consultantFlags("acquisition_creative", ID)).toEqual({ canCall: false, isManager: true });
  });
});
