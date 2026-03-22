"use client";

import { useEffect, useId, useRef } from "react";

type Props = { code: string };

export function SopMermaidBlock({ code }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = (await import("mermaid")).default;
      m.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        theme: "dark",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      });
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = "";
      const graphId = `crm_m_${uid}_${Math.random().toString(36).slice(2, 9)}`;
      try {
        const { svg } = await m.render(graphId, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (e) {
        if (!cancelled && ref.current) {
          ref.current.innerHTML = `<pre class="text-xs text-rose-300/90 whitespace-pre-wrap p-2">${String(e)}</pre>`;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, uid]);

  return <div ref={ref} className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 p-3 min-h-[120px]" />;
}
