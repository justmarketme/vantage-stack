"use client";

import { useEffect } from "react";
import { Calendar } from "lucide-react";

// Shared booking CTA — opens the site's confirmed Cal.com discovery-call flow
// (same flow as the homepage). Used for every landing-page CTA.
const CAL_LINK = "vantagestack/discovery-call";

function useCalEmbed() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as any;
    if (win.Cal?.loaded) return;
    (function (C: any, A: string, L: string) {
      const p = (a: any, ar: any) => {
        a.q.push(ar);
      };
      const d = C.document;
      C.Cal =
        C.Cal ||
        function (...args: any[]) {
          const cal = C.Cal;
          if (!cal.loaded) {
            cal.ns = {};
            cal.q = cal.q || [];
            const s = d.createElement("script");
            s.src = A;
            d.head.appendChild(s);
            cal.loaded = true;
          }
          if (args[0] === L) {
            const api: any = (...a: any[]) => {
              p(api, a);
            };
            const ns = args[1];
            api.q = api.q || [];
            if (typeof ns === "string") {
              cal.ns[ns] = cal.ns[ns] || api;
              p(cal.ns[ns], args);
              p(cal, ["-queue", ns]);
            } else {
              p(cal, args);
            }
            return;
          }
          p(cal, args);
        };
    })(win, "https://app.cal.com/embed/embed.js", "init");
    win.Cal("init", "discovery", { origin: "https://app.cal.com" });
  }, []);
}

export function BookCta({
  label,
  variant = "primary",
  className = "",
}: {
  label: string;
  variant?: "primary" | "ghost";
  className?: string;
}) {
  useCalEmbed();
  const base = variant === "ghost" ? "vs-button-ghost" : "vs-button-primary";
  return (
    <button
      data-cal-namespace="discovery"
      data-cal-link={CAL_LINK}
      data-cal-config='{"layout":"popup"}'
      className={`${base} ${className}`}
    >
      <Calendar size={15} className="mr-1.5 -mt-0.5 inline-block" />
      {label} →
    </button>
  );
}
