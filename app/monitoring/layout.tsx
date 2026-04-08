import { AdminNavbar } from "../../components/admin/AdminNavbar";

export default function MonitoringLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AdminNavbar />
      {children}
    </div>
  );
}
