import * as XLSX from "xlsx";
import { format, parseISO, eachDayOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { de } from "date-fns/locale";
import { einsatzBelegt } from "@/lib/matching";

type Einsatz = {
  datum: string;
  dienst: "F" | "S" | "N";
  status: string;
  notiz: string | null;
  einrichtung: { name: string; ort: string | null; wohnbereich: string | null } | null;
};
type Abwesenheit = { datum: string; art: string; notiz: string | null };
type Mitarbeiter = { vorname: string; nachname: string; kuerzel: string; qualifikation: string };

const ZEITEN: Record<string, { kuerzel: string; zeit: string }> = {
  F: { kuerzel: "FD", zeit: "06:00 bis 14:00" },
  S: { kuerzel: "SD", zeit: "14:00 bis 22:00" },
  N: { kuerzel: "ND", zeit: "20:30 bis 06:15" },
};

export function generateDienstplanExcel(opts: {
  mitarbeiter: Mitarbeiter;
  einsaetze: Einsatz[];
  abwesenheiten: Abwesenheit[];
  von: string;
  bis: string;
  erstellerName?: string;
}) {
  const m = opts.mitarbeiter;
  const vonD = parseISO(opts.von);
  const monatStart = startOfMonth(vonD);
  const monatEnde = endOfMonth(vonD);
  const tage = eachDayOfInterval({ start: monatStart, end: monatEnde });

  const einsatzByDate = new Map<string, Einsatz>();
  for (const e of opts.einsaetze) {
    const prev = einsatzByDate.get(e.datum);
    if (!prev || (!einsatzBelegt(prev.status) && einsatzBelegt(e.status))) einsatzByDate.set(e.datum, e);
  }
  const abwByDate = new Map(opts.abwesenheiten.map((a) => [a.datum, a]));

  const aoa: (string | number)[][] = [];
  aoa.push([format(monatStart, "MMMM yyyy", { locale: de })]);
  aoa.push([`${m.vorname} ${m.nachname} (${m.kuerzel}) – ${m.qualifikation}`]);
  aoa.push([]);
  aoa.push(["Datum", "Schicht", "Zeit", "Einrichtung", "Adresse", "WB"]);

  for (const d of tage) {
    const key = format(d, "yyyy-MM-dd");
    const e = einsatzByDate.get(key);
    const a = abwByDate.get(key);
    const datumStr = format(d, "EEEE, dd.MM.yyyy", { locale: de });
    if (e) {
      const z = ZEITEN[e.dienst] ?? { kuerzel: e.dienst, zeit: "" };
      aoa.push([datumStr, z.kuerzel, z.zeit, e.einrichtung?.name ?? "", e.einrichtung?.ort ?? "", e.einrichtung?.wohnbereich ?? ""]);
    } else if (a) {
      aoa.push([datumStr, "", a.art, "", "", ""]);
    } else {
      aoa.push([datumStr, "", "", "", "", ""]);
    }
  }

  aoa.push([]);
  aoa.push(["Hinweis: Die im Dienstplan angegebenen Zeiten sind verbindlich, können jedoch vor Ort angepasst werden. Für die Abrechnung zählen ausschließlich die tatsächlich geleisteten und vom Kunden bestätigten Arbeitszeiten."]);
  aoa.push([`erstellt von: ${opts.erstellerName ?? "DispoPlan"}`]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 18 }, { wch: 30 }, { wch: 24 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Dienstplan");

  const fname = `Dienstplan_${m.kuerzel}_${format(monatStart, "yyyy-MM")}.xlsx`;
  XLSX.writeFile(wb, fname);
}
