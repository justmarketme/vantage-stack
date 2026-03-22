import { jsPDF } from "jspdf";

const MARGIN = 48;
const LINE = 14;
const PAGE_W = 595.28;
const MAX_W = PAGE_W - MARGIN * 2;

/** Simple multi-page text PDF for report handoff (video as link, not embedded). */
export function buildReportHandoffPdf(params: {
  clientName: string;
  reportTitle?: string;
  narrativeMarkdownPlain: string;
  videoUrl: string;
  consultationUrl: string;
  generatedAt?: Date;
}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const when = (params.generatedAt ?? new Date()).toISOString().slice(0, 10);

  doc.setFillColor(11, 11, 12);
  doc.rect(0, 0, PAGE_W, 842, "F");
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("VantageStack", MARGIN, MARGIN + 10);
  doc.setFontSize(11);
  doc.setTextColor(156, 163, 175);
  doc.text("Business analysis report", MARGIN, MARGIN + 32);

  doc.setTextColor(248, 250, 252);
  doc.setFontSize(16);
  doc.text(params.reportTitle ?? `Report — ${params.clientName}`, MARGIN, MARGIN + 58);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(156, 163, 175);
  doc.text(`Prepared for ${params.clientName} · ${when}`, MARGIN, MARGIN + 78);

  let y = MARGIN + 100;
  doc.setTextColor(96, 165, 250);
  doc.setFontSize(11);
  doc.text("Video analysis (open link):", MARGIN, y);
  y += LINE;
  doc.setTextColor(248, 250, 252);
  const videoLines = doc.splitTextToSize(params.videoUrl || "—", MAX_W);
  doc.setFontSize(9);
  doc.text(videoLines, MARGIN, y);
  y += videoLines.length * LINE + 8;

  doc.setFontSize(11);
  doc.setTextColor(96, 165, 250);
  doc.text("Book a consultation:", MARGIN, y);
  y += LINE;
  doc.setTextColor(248, 250, 252);
  doc.setFontSize(9);
  const consultLines = doc.splitTextToSize(params.consultationUrl, MAX_W);
  doc.text(consultLines, MARGIN, y);
  y += consultLines.length * LINE + 16;

  doc.setTextColor(248, 250, 252);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Written report", MARGIN, y);
  y += LINE + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);

  const body = params.narrativeMarkdownPlain.replace(/```[\s\S]*?```/g, "(code block omitted)");
  const paras = body.split(/\n\n+/);
  for (const p of paras) {
    const lines = doc.splitTextToSize(p.trim(), MAX_W);
    for (const line of lines) {
      if (y > 780) {
        doc.addPage();
        doc.setFillColor(11, 11, 12);
        doc.rect(0, 0, PAGE_W, 842, "F");
        doc.setTextColor(248, 250, 252);
        y = MARGIN;
      }
      doc.text(line, MARGIN, y);
      y += LINE;
    }
    y += 6;
  }

  return doc.output("arraybuffer");
}
