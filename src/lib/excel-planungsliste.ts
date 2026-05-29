import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { DIENST_KURZ } from "@/lib/dispo-utils";
import { einsatzBelegt } from "@/lib/matching";

type Mitarbeiter = { id: string; kuerzel: string; vorname: string; nachname: string; qualifikation: string; anstellung: string };
type Einsatz = { mitarbeiter_id: string; einrichtung_id: string; datum: string; dienst: "F" | "S" | "N"; status: string };
type Abw = { mitarbeiter_id: string; datum: string; art: string };
type Einrichtung = { id: string; name: string };

type Args = {
  mitarbeiter: Mitarbeiter[];
  einsaetze: Einsatz[];
  abwesenheiten: Abw[];
  einrichtungen: Einrichtung[];
  dateRange: Date[];
};

function buildCells(args: Args) {
  const einMap = new Map(args.einrichtungen.map((e) => [e.id, e.name]));
  const eByCell = new Map<string, Einsatz[]>();
  args.einsaetze.forEach((e) => {
    const k = `${e.mitarbeiter_id}|${e.datum}`;
    const arr = eByCell.get(k) ?? [];
    arr.push(e);
    eByCell.set(k, arr);
  });
  const aByCell = new Map<string, string>();
  args.abwesenheiten.forEach((a) => aByCell.set(`${a.mitarbeiter_id}|${a.datum}`, a.art));

  return args.mitarbeiter.map((m) => {
    const row = [`${m.kuerzel} – ${m.nachname}, ${m.vorname}`, m.qualifikation, m.anstellung];
    args.dateRange.forEach((d) => {
      const iso = format(d, "yyyy-MM-dd");
      const list = eByCell.get(`${m.id}|${iso}`) ?? [];
      const a = aByCell.get(`${m.id}|${iso}`);
      if (list.length > 0) {
        // belegende Einsätze bevorzugen; bei mehreren mit "/" verbinden
        const belegend = list.filter((e) => einsatzBelegt(e.status));
        const show = (belegend.length > 0 ? belegend : list)
          .map((e) => `${DIENST_KURZ[e.dienst]} ${einMap.get(e.einrichtung_id) ?? ""}`.trim())
          .join(" / ");
        row.push(show);
      } else if (a) {
        row.push(a);
      } else {
        row.push("");
      }
    });
    return row;
  });
}

export function exportPlanungslisteExcel(args: Args) {
  const head = ["Mitarbeiter", "Quali", "Anstellung", ...args.dateRange.map((d) => format(d, "EEE dd.MM.", { locale: de }))];
  const rows = buildCells(args);
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
  ws["!cols"] = [{ wch: 32 }, { wch: 10 }, { wch: 10 }, ...args.dateRange.map(() => ({ wch: 14 }))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planungsliste");
  const fname = `Planungsliste_${format(args.dateRange[0], "yyyy-MM-dd")}_${format(args.dateRange[args.dateRange.length - 1], "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, fname);
}

export function exportPlanungslistePdf(args: Args) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(
    `Planungsliste ${format(args.dateRange[0], "dd.MM.yyyy", { locale: de })} – ${format(args.dateRange[args.dateRange.length - 1], "dd.MM.yyyy", { locale: de })}`,
    14, 14,
  );
  const head = ["Mitarbeiter", "Quali", "Anst.", ...args.dateRange.map((d) => format(d, "EEE\ndd.MM.", { locale: de }))];
  const rows = buildCells(args);
  autoTable(doc, {
    startY: 20,
    head: [head],
    body: rows,
    styles: { fontSize: 6.5, cellPadding: 1, lineColor: [210, 210, 210], lineWidth: 0.1, overflow: "linebreak" },
    headStyles: { fillColor: [50, 50, 50], textColor: 255, fontSize: 7 },
    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 14 }, 2: { cellWidth: 16 } },
  });
  doc.save(`Planungsliste_${format(args.dateRange[0], "yyyy-MM-dd")}_${format(args.dateRange[args.dateRange.length - 1], "yyyy-MM-dd")}.pdf`);
}
