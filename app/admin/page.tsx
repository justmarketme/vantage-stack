import { redirect } from "next/navigation";
import { getSessionFromCookies, roleFromSession } from "../../lib/admin/api-auth";
import { ADMIN_HOME, homePathForRole } from "../../lib/admin/rbac-paths";
import { getAdminSetupApiPayload } from "../../lib/admin/setup-status";
import { AdminHub } from "../../components/admin/AdminHub";
import { AdminPublicLanding } from "../../components/admin/AdminPublicLanding";

export default async function AdminPage() {
  const session = await getSessionFromCookies();
  if (!session) {
    const setup = await getAdminSetupApiPayload();
    const showFirstTimeSetup = setup.ok && setup.needs_setup;
    return <AdminPublicLanding showFirstTimeSetup={showFirstTimeSetup} />;
  }
  // Post-login lands here by default; roles whose home is elsewhere (sales_consultant →
  // /consultant) are sent on rather than shown a hub of links they cannot open.
  const role = roleFromSession(session);
  const home = role ? homePathForRole(role) : ADMIN_HOME;
  if (home !== ADMIN_HOME) redirect(home);
  return <AdminHub />;
}
