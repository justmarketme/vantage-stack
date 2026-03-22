import { AdminLoginForm } from "./login-form";

type PageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

export default async function AdminLoginPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = sp.next;
  const nextParam = Array.isArray(raw) ? raw[0] : raw;
  const defaultNext =
    typeof nextParam === "string" && nextParam.startsWith("/") ? nextParam : "/admin/dashboard";

  return <AdminLoginForm defaultNext={defaultNext} />;
}
