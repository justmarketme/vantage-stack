"use client";

export function AdminLogoutButton() {
  return (
    <button
      type="button"
      className="text-sm text-textMuted underline underline-offset-4 hover:text-textPrimary"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.href = "/admin/login";
      }}
    >
      Sign out
    </button>
  );
}
