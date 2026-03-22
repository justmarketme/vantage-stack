"use client";

import { useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

async function download(url: string, filename: string) {
  const res = await fetch(url);
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function ExportButtons(props: { exportCsvUrl: string; exportCsvName: string; pdfTargetId: string; pdfName: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => download(props.exportCsvUrl, props.exportCsvName)}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100"
      >
        Export CSV
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          const el = document.getElementById(props.pdfTargetId);
          if (!el) return;
          setBusy(true);
          try {
            const canvas = await html2canvas(el, { scale: 2, backgroundColor: "#ffffff" });
            const img = canvas.toDataURL("image/png");
            const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
            const pw = pdf.internal.pageSize.getWidth();
            const ph = pdf.internal.pageSize.getHeight();
            const ratio = Math.min(pw / canvas.width, ph / canvas.height);
            const w = canvas.width * ratio;
            const h = canvas.height * ratio;
            pdf.addImage(img, "PNG", (pw - w) / 2, (ph - h) / 2, w, h);
            pdf.save(props.pdfName);
          } finally {
            setBusy(false);
          }
        }}
        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 active:bg-slate-950 disabled:opacity-60"
      >
        {busy ? "Exporting…" : "Export PDF"}
      </button>
    </div>
  );
}

