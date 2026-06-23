"use client";

import { useEffect, useState } from "react";

export function SessionWarning() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    async function tick() {
      try {
        const r = await fetch("/api/admin/session");
        const j = (await r.json()) as { authenticated?: boolean; session_warn_at_ms?: number };
        if (!j.authenticated || typeof j.session_warn_at_ms !== "number") return;
        setShow(Date.now() >= j.session_warn_at_ms);
      } catch {
        /* ignore */
      }
    }
    tick();
    const t = setInterval(tick, 60_000);
    return () => {
      if (t) clearInterval(t);
    };
  }, []);

  async function extend() {
    try {
      const r = await fetch("/api/admin/session/extend", { method: "POST" });
      if (r.ok) setShow(false);
    } catch {
      /* ignore */
    }
  }

  if (!show) return null;

  return (
    <div
      className="fixed bottom-4 left-1/2 z-50 w-[min(100%,28rem)] -translate-x-1/2 rounded-xl border border-amber-500/40 bg-amber-950/90 px-4 py-3 text-sm text-amber-100 shadow-lg"
      role="status"
    >
      <p>Your session will expire in about 10 minutes.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={extend} className="rounded-lg bg-amber-500/20 px-3 py-1 text-amber-50 hover:bg-amber-500/30">
          Stay signed in
        </button>
        <button
          type="button"
          className="rounded-lg px-3 py-1 underline"
          onClick={async () => {
            await fetch("/api/admin/logout", { method: "POST" });
            window.location.href = "/admin/login";
          }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
