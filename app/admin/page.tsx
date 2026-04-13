import { getSessionFromCookies } from "../../lib/admin/api-auth";
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
  return <AdminHub />;
}
