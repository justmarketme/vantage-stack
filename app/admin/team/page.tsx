import { Navbar } from "../../../components/layout/Navbar";
import { TeamConsole } from "./team-console";

export default function AdminTeamPage() {
  return (
    <div>
      <Navbar />
      <main className="vs-container pb-24 pt-28">
        <TeamConsole />
      </main>
    </div>
  );
}
