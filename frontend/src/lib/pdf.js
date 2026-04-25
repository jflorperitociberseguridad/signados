import jsPDF from "jspdf";

/**
 * Export an array of conversation messages or transcript items to a PDF file.
 * messages: [{ from?: 'signer'|'speaker'|'user', text, lang?, ts?, summary? }]
 */
export function exportConversationPDF(messages, { title = "Conversación – SignLanguage Pro" } = {}) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor("#002FA7");
  doc.text(title, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor("#475569");
  doc.text(new Date().toLocaleString(), margin, y);
  y += 24;

  doc.setDrawColor("#e2e8f0");
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  const wrap = (txt, maxW) => doc.splitTextToSize(txt || "", maxW);

  for (const m of messages) {
    if (y > pageH - margin - 60) {
      doc.addPage();
      y = margin;
    }
    const role =
      m.from === "speaker"
        ? "Persona oyente"
        : m.from === "signer"
        ? "Persona signante"
        : m.from || "Mensaje";
    const meta = [role, m.lang, m.ts].filter(Boolean).join(" · ");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor("#0f172a");
    doc.text(meta, margin, y);
    y += 14;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor("#1e293b");
    const lines = wrap(m.text || "", pageW - margin * 2);
    for (const line of lines) {
      if (y > pageH - margin - 20) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += 16;
    }
    if (m.summary) {
      doc.setFontSize(10);
      doc.setTextColor("#64748b");
      const sLines = wrap(`Resumen: ${m.summary}`, pageW - margin * 2);
      for (const line of sLines) {
        if (y > pageH - margin - 20) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 14;
      }
    }
    y += 10;
  }

  doc.save(`signlanguage-${Date.now()}.pdf`);
}
