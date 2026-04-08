import { AdminNavbar } from "../../../components/admin/AdminNavbar";
import { TeamConsole } from "./team-console";

export default function AdminTeamPage() {
  return (
    <div>
      <AdminNavbar />
      <main className="vs-container pb-24 pt-28">
        <TeamConsole />
      </main>
    </div>
  );
}
