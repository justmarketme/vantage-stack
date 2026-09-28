"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Inline Cal.com booking calendar, themed to Vantage Stack.
 *
 * Inline rather than the popup used elsewhere on the site: on a page whose whole
 * argument is "booking should be frictionless", making the visitor click through
 * to a modal to book a call would undercut the point.
 *
 * On theming — the embed is a cross-origin iframe, so our CSS cannot reach into
 * it. Styling therefore goes through Cal's own `ui` API (`cssVarsPerTheme`),
 * which is the only supported way to brand it. We set the brand colour to
 * Vantage Blue and force the dark theme so it does not flash a white calendar
 * onto a near-black page. The surrounding chrome is ours.
 */

const CAL_LINK = "vantagestack/discovery-call";
/** Own namespace so this cannot collide with the popup embed on other pages. */
const NAMESPACE = "clinics-demo";
const MOUNT_ID = "vs-clinics-cal";

declare global {
  interface Window {
    Cal?: any;
  }
}

/** Loads Cal's embed script once per page, idempotently. */
function loadCalScript() {
  if (typeof window === "undefined") return;
  const win = window as any;
  if (win.Cal?.loaded) return;

  (function (C: any, A: string, L: string) {
    const p = (a: any, ar: any) => a.q.push(ar);
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
          const api: any = (...a: any[]) => p(api, a);
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
}

export function ClinicBookingCalendar() {
  const [failed, setFailed] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    // The embed appends DOM into the mount node; running it twice (React strict
    // mode in dev) would stack two calendars.
    if (mounted.current) return;
    mounted.current = true;

    try {
      loadCalScript();
      const Cal = (window as any).Cal;
      if (!Cal) {
        setFailed(true);
        return;
      }

      Cal("init", NAMESPACE, { origin: "https://app.cal.com" });

      Cal.ns[NAMESPACE]("inline", {
        elementOrSelector: `#${MOUNT_ID}`,
        calLink: CAL_LINK,
        layout: "month_view",
      });

      Cal.ns[NAMESPACE]("ui", {
        theme: "dark",
        cssVarsPerTheme: {
          dark: {
            // Vantage Blue — matches `accent` in tailwind.config.ts.
            "cal-brand": "#3B82F6",
            "cal-bg": "#0B0B0C",
            "cal-bg-emphasis": "#1A1A1D",
            "cal-border": "rgba(255,255,255,0.10)",
            "cal-border-emphasis": "rgba(255,255,255,0.20)",
            "cal-text": "#F8F9FA",
            "cal-text-emphasis": "#FFFFFF",
            "cal-text-subtle": "#9CA3AF",
          },
        },
        hideEventTypeDetails: false,
        // Cal reads the visitor's locale for time display; leaving this unset
        // means a Johannesburg visitor sees SAST without us hardcoding it.
      });
    } catch {
      // Ad-blockers and strict privacy extensions block app.cal.com outright.
      // That is common enough that a dead grey box is not an acceptable
      // failure mode — fall back to a plain link.
      setFailed(true);
    }
  }, []);

  if (failed) {
    return (
      <div className="vs-card text-center">
        <p className="font-heading text-lg">The calendar could not load.</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-textMuted">
          A browser extension is most likely blocking it. You can book directly instead — or use
          the blueprint form below and we will come to you.
        </p>
        <a
          href={`https://cal.com/${CAL_LINK}`}
          target="_blank"
          rel="noopener noreferrer"
          className="vs-button-primary mt-5"
        >
          Open the booking page
        </a>
      </div>
    );
  }

  return (
    <div className="vs-card !p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
          </span>
          <p className="text-sm font-medium">Pick a time</p>
        </div>
        <span className="vs-badge !px-2 !py-0.5 !text-[10px]">20 minutes</span>
      </div>

      {/* Cal mounts into this node. min-height prevents a layout jump while the
          iframe negotiates its own height. */}
      <div id={MOUNT_ID} className="min-h-[560px] w-full" />
    </div>
  );
}
