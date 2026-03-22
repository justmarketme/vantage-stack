import Link from "next/link";

type Props = {
  searchParams: Promise<{ from?: string | string[] }>;
};

export default async function AdminUnauthorizedPage({ searchParams }: Props) {
  const sp = await searchParams;
  const raw = sp.from;
  const fromPath = Array.isArray(raw) ? raw[0] : raw;
  const safeFrom =
    typeof fromPath === "string" && fromPath.startsWith("/") && !fromPath.startsWith("//") ? fromPath : null;

  return (
    <main className="min-h-screen bg-background px-4 py-24">
      <div className="mx-auto max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.2em] text-textMuted">403</p>
        <h1 className="mt-2 font-heading text-2xl font-semibold text-textPrimary">Access denied</h1>
        <p className="mt-3 text-sm text-textMuted">
          Your role does not have permission to open this area
          {safeFrom ? (
            <>
              : <span className="font-mono text-textPrimary/80">{safeFrom}</span>
            </>
          ) : (
            "."
          )}
        </p>
        <div className="mt-10 flex flex-col gap-3 text-sm">
          <Link href="/admin" className="vs-button-primary justify-center">
            Admin home
          </Link>
          <Link href="/crm" className="text-sky-300 underline">
            CRM
          </Link>
          <Link href="/admin/login" className="text-textMuted underline">
            Switch account
          </Link>
        </div>
      </div>
    </main>
  );
}
