import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, parseISO, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { de } from "date-fns/locale";

type Einsatz = {
  datum: string;
  dienst: "F" | "S" | "N";
  status: string;
  notiz: string | null;
  einrichtung: { name: string; ort: string | null; wohnbereich: string | null } | null;
};
type Abwesenheit = { datum: string; art: string; notiz: string | null };
type Mitarbeiter = { vorname: string; nachname: string; kuerzel: string; qualifikation: string };

// Standardzeiten je Dienst (passend zur Vorlage)
const ZEITEN: Record<string, { kuerzel: string; zeit: string }> = {
  F: { kuerzel: "FD", zeit: "06:00 bis 14:00" },
  S: { kuerzel: "SD", zeit: "14:00 bis 22:00" },
  N: { kuerzel: "ND", zeit: "20:30 bis 06:15" },
};

export function generateDienstplanPdf(opts: {
  mitarbeiter: Mitarbeiter;
  einsaetze: Einsatz[];
  abwesenheiten: Abwesenheit[];
  von: string;
  bis: string;
  erstellerName?: string;
}) {
  const m = opts.mitarbeiter;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Zeitraum auf ganzen Monat ausweiten (Vorlagen-Format)
  const vonD = parseISO(opts.von);
  const monatStart = startOfMonth(vonD);
  const monatEnde = endOfMonth(vonD);
  const tage = eachDayOfInterval({ start: monatStart, end: monatEnde });

  const einsatzByDate = new Map(opts.einsaetze.map((e) => [e.datum, e]));
  const abwByDate = new Map(opts.abwesenheiten.map((a) => [a.datum, a]));

  // Header
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(format(monatStart, "MMMM yyyy", { locale: de }), 14, 16);

  const rows = tage.map((d) => {
    const key = format(d, "yyyy-MM-dd");
    const e = einsatzByDate.get(key);
    const a = abwByDate.get(key);
    const datumStr = format(d, "EEEE, dd.MM.yyyy", { locale: de });
    if (e) {
      const z = ZEITEN[e.dienst] ?? { kuerzel: e.dienst, zeit: "" };
      return [
        datumStr,
        z.kuerzel,
        z.zeit,
        e.einrichtung?.name ?? "",
        e.einrichtung?.ort ?? "",
        e.einrichtung?.wohnbereich ?? "",
      ];
    }
    if (a) return [datumStr, "", a.art, "", "", ""];
    return [datumStr, "", "", "", "", ""];
  });

  autoTable(doc, {
    startY: 22,
    head: [["Datum", "Schicht", "Zeit", "Einrichtung", "Adresse", "WB"]],
    body: rows,
    styles: { fontSize: 8, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.1 },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontSize: 9 },
    columnStyles: {
      0: { cellWidth: 42 },
      1: { cellWidth: 14, halign: "center" },
      2: { cellWidth: 28 },
      3: { cellWidth: 48 },
      4: { cellWidth: 40 },
      5: { cellWidth: 12, halign: "center" },
    },
  });

  // Footer
  const finalY = (doc as any).lastAutoTable?.finalY ?? 270;
  const footerY = Math.max(finalY + 8, 270);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80);
  const hinweis =
    "Die im Dienstplan angegebenen Zeiten sind verbindlich, können jedoch vor Ort angepasst werden. " +
    "Für die Abrechnung zählen ausschließlich die tatsächlich geleisteten und vom Kunden bestätigten Arbeitszeiten.";
  const lines = doc.splitTextToSize(hinweis, 180);
  doc.text(lines, 14, footerY);

  doc.setTextColor(0);
  doc.setFontSize(9);
  doc.text(`erstellt von: ${opts.erstellerName ?? "DispoPlan"}`, 14, footerY + 12);
  doc.text(`für: ${m.vorname} ${m.nachname} (${m.kuerzel}) – ${m.qualifikation}`, 14, footerY + 18);

  const fname = `Dienstplan_${m.kuerzel}_${format(monatStart, "yyyy-MM")}.pdf`;
  doc.save(fname);
}
