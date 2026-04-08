import { AdminNavbar } from "../../components/admin/AdminNavbar";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AdminNavbar />
      {children}
    </div>
  );
}
