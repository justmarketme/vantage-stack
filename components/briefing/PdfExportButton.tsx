"use client";

import { useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export function PdfExportButton(props: { pdfTargetId: string; pdfName: string }) {
  const [busy, setBusy] = useState(false);

  return (
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
          const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

          // Fit the screenshot into a single-page PDF (briefings are short).
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
      {busy ? "Exporting…" : "Download PDF"}
    </button>
  );
}

