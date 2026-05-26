import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { DIENST_LABEL, STATUS_LABEL, type Dienst, type EinsatzStatus } from "@/lib/dispo-utils";

type Einsatz = {
  datum: string;
  dienst: Dienst;
  status: EinsatzStatus;
  notiz: string | null;
  einrichtung: { name: string; ort: string | null; wohnbereich: string | null } | null;
};

type Abwesenheit = { datum: string; art: string; notiz: string | null };

type Mitarbeiter = {
  vorname: string;
  nachname: string;
  kuerzel: string;
  qualifikation: string;
};

export function generateDienstplanPdf(opts: {
  mitarbeiter: Mitarbeiter;
  einsaetze: Einsatz[];
  abwesenheiten: Abwesenheit[];
  von: string;
  bis: string;
}) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const m = opts.mitarbeiter;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Dienstplan", 14, 18);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(`${m.vorname} ${m.nachname} (${m.kuerzel}) – ${m.qualifikation}`, 14, 26);
  const vonF = format(parseISO(opts.von), "dd.MM.yyyy", { locale: de });
  const bisF = format(parseISO(opts.bis), "dd.MM.yyyy", { locale: de });
  doc.text(`Zeitraum: ${vonF} – ${bisF}`, 14, 32);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Erstellt am ${format(new Date(), "dd.MM.yyyy HH:mm", { locale: de })}`, 14, 38);
  doc.setTextColor(0);

  const rows = opts.einsaetze.map((e) => [
    format(parseISO(e.datum), "EEE dd.MM.yyyy", { locale: de }),
    DIENST_LABEL[e.dienst],
    e.einrichtung?.name ?? "-",
    [e.einrichtung?.wohnbereich, e.einrichtung?.ort].filter(Boolean).join(" · "),
    STATUS_LABEL[e.status] ?? e.status,
    e.notiz ?? "",
  ]);

  autoTable(doc, {
    startY: 44,
    head: [["Datum", "Dienst", "Einrichtung", "Bereich / Ort", "Status", "Notiz"]],
    body: rows.length > 0 ? rows : [["—", "", "Keine Einsätze im Zeitraum", "", "", ""]],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 18 },
      4: { cellWidth: 26 },
    },
  });

  if (opts.abwesenheiten.length > 0) {
    const finalY = (doc as any).lastAutoTable?.finalY ?? 50;
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Abwesenheiten", 14, finalY + 10);
    autoTable(doc, {
      startY: finalY + 14,
      head: [["Datum", "Art", "Notiz"]],
      body: opts.abwesenheiten.map((a) => [
        format(parseISO(a.datum), "EEE dd.MM.yyyy", { locale: de }),
        a.art,
        a.notiz ?? "",
      ]),
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [80, 80, 80], textColor: 255 },
    });
  }

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Seite ${i} / ${pageCount}`, 200, 290, { align: "right" });
  }

  const filename = `Dienstplan_${m.kuerzel}_${opts.von}_${opts.bis}.pdf`;
  doc.save(filename);
}
