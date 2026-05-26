import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format, startOfMonth, endOfMonth, eachDayOfInterval } from "date-fns";
import { de } from "date-fns/locale";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listMitarbeiter, listEinrichtungen, getPlanData } from "@/lib/dispo.functions";
import { exportPlanungslisteExcel, exportPlanungslistePdf } from "@/lib/excel-planungsliste";

export const Route = createFileRoute("/_authenticated/export")({
  component: ExportPage,
});

function isoDay(d: Date) { return format(d, "yyyy-MM-dd"); }

function ExportPage() {
  const today = new Date();
  const [von, setVon] = useState(isoDay(startOfMonth(today)));
  const [bis, setBis] = useState(isoDay(endOfMonth(today)));

  const listMA = useServerFn(listMitarbeiter);
  const listEin = useServerFn(listEinrichtungen);
  const getPlan = useServerFn(getPlanData);

  const maQ = useQuery({ queryKey: ["export-ma"], queryFn: () => listMA() });
  const einQ = useQuery({ queryKey: ["export-ein"], queryFn: () => listEin() });

  async function loadPlan() {
    return await getPlan({ data: { von, bis } });
  }

  // -------- Mitarbeiter --------
  function exportMitarbeiterExcel() {
    const rows = (maQ.data ?? []).map((m: any) => ({
      Kürzel: m.kuerzel, Vorname: m.vorname, Nachname: m.nachname,
      Qualifikation: m.qualifikation, Anstellung: m.anstellung,
      Telefon: m.telefon ?? "", Email: m.email ?? "", Wohnort: m.wohnort ?? "",
      Aktiv: m.aktiv ? "ja" : "nein", Notiz: m.notiz ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mitarbeiter");
    XLSX.writeFile(wb, `Mitarbeiter_${isoDay(today)}.xlsx`);
  }

  function exportMitarbeiterPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14); doc.text("Mitarbeiter", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Kürzel", "Vorname", "Nachname", "Quali", "Anst.", "Telefon", "Email", "Ort", "Aktiv"]],
      body: (maQ.data ?? []).map((m: any) => [
        m.kuerzel, m.vorname, m.nachname, m.qualifikation, m.anstellung,
        m.telefon ?? "", m.email ?? "", m.wohnort ?? "", m.aktiv ? "ja" : "nein",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [50, 50, 50] },
    });
    doc.save(`Mitarbeiter_${isoDay(today)}.pdf`);
  }

  // -------- Einrichtungen --------
  function exportEinrichtungenExcel() {
    const rows = (einQ.data ?? []).map((e: any) => ({
      Träger: e.traeger?.name ?? "", Name: e.name, Ort: e.ort ?? "",
      Wohnbereich: e.wohnbereich ?? "",
      Kontakt: e.kontakt_name ?? "", Telefon: e.kontakt_telefon ?? "", Email: e.kontakt_email ?? "",
      VS_PFK: e.vs_satz_pfk ?? "", VS_PHK: e.vs_satz_phk ?? "",
      Aktiv: e.aktiv ? "ja" : "nein", Notiz: e.notiz ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Einrichtungen");
    XLSX.writeFile(wb, `Einrichtungen_${isoDay(today)}.xlsx`);
  }

  function exportEinrichtungenPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14); doc.text("Einrichtungen", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Träger", "Name", "Ort", "Kontakt", "Telefon", "Email", "VS PFK", "VS PHK", "Aktiv"]],
      body: (einQ.data ?? []).map((e: any) => [
        e.traeger?.name ?? "", e.name, e.ort ?? "", e.kontakt_name ?? "",
        e.kontakt_telefon ?? "", e.kontakt_email ?? "",
        e.vs_satz_pfk ?? "", e.vs_satz_phk ?? "", e.aktiv ? "ja" : "nein",
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [50, 50, 50] },
    });
    doc.save(`Einrichtungen_${isoDay(today)}.pdf`);
  }

  // -------- Einsätze --------
  async function exportEinsaetzeExcel() {
    const d = await loadPlan();
    const maMap = new Map(d.mitarbeiter.map((m: any) => [m.id, m]));
    const einMap = new Map(d.einrichtungen.map((e: any) => [e.id, e]));
    const rows = d.einsaetze
      .sort((a: any, b: any) => a.datum.localeCompare(b.datum))
      .map((e: any) => {
        const m: any = maMap.get(e.mitarbeiter_id);
        const ein: any = einMap.get(e.einrichtung_id);
        return {
          Datum: e.datum, Dienst: e.dienst, Status: e.status,
          Kürzel: m?.kuerzel ?? "", Mitarbeiter: m ? `${m.nachname}, ${m.vorname}` : "",
          Einrichtung: ein?.name ?? "", Ort: ein?.ort ?? "", Notiz: e.notiz ?? "",
        };
      });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Einsätze");
    XLSX.writeFile(wb, `Einsaetze_${von}_${bis}.xlsx`);
  }

  async function exportEinsaetzePdf() {
    const d = await loadPlan();
    const maMap = new Map(d.mitarbeiter.map((m: any) => [m.id, m]));
    const einMap = new Map(d.einrichtungen.map((e: any) => [e.id, e]));
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14); doc.text(`Einsätze ${von} – ${bis}`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Datum", "Dienst", "Status", "Kürzel", "Mitarbeiter", "Einrichtung", "Notiz"]],
      body: d.einsaetze
        .sort((a: any, b: any) => a.datum.localeCompare(b.datum))
        .map((e: any) => {
          const m: any = maMap.get(e.mitarbeiter_id);
          const ein: any = einMap.get(e.einrichtung_id);
          return [
            e.datum, e.dienst, e.status, m?.kuerzel ?? "",
            m ? `${m.nachname}, ${m.vorname}` : "", ein?.name ?? "", e.notiz ?? "",
          ];
        }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [50, 50, 50] },
    });
    doc.save(`Einsaetze_${von}_${bis}.pdf`);
  }

  // -------- Abwesenheiten --------
  async function exportAbwesenheitenExcel() {
    const d = await loadPlan();
    const maMap = new Map(d.mitarbeiter.map((m: any) => [m.id, m]));
    const rows = d.abwesenheiten
      .sort((a: any, b: any) => a.datum.localeCompare(b.datum))
      .map((a: any) => {
        const m: any = maMap.get(a.mitarbeiter_id);
        return {
          Datum: a.datum, Art: a.art,
          Kürzel: m?.kuerzel ?? "", Mitarbeiter: m ? `${m.nachname}, ${m.vorname}` : "",
          Notiz: a.notiz ?? "",
        };
      });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Abwesenheiten");
    XLSX.writeFile(wb, `Abwesenheiten_${von}_${bis}.xlsx`);
  }

  async function exportAbwesenheitenPdf() {
    const d = await loadPlan();
    const maMap = new Map(d.mitarbeiter.map((m: any) => [m.id, m]));
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(14); doc.text(`Abwesenheiten ${von} – ${bis}`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Datum", "Art", "Kürzel", "Mitarbeiter", "Notiz"]],
      body: d.abwesenheiten
        .sort((a: any, b: any) => a.datum.localeCompare(b.datum))
        .map((a: any) => {
          const m: any = maMap.get(a.mitarbeiter_id);
          return [a.datum, a.art, m?.kuerzel ?? "", m ? `${m.nachname}, ${m.vorname}` : "", a.notiz ?? ""];
        }),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [50, 50, 50] },
    });
    doc.save(`Abwesenheiten_${von}_${bis}.pdf`);
  }

  // -------- Planungsliste (Matrix) --------
  async function exportPlanungslisteXlsx() {
    const d = await loadPlan();
    const dateRange = eachDayOfInterval({ start: new Date(von), end: new Date(bis) });
    exportPlanungslisteExcel({
      mitarbeiter: d.mitarbeiter as any,
      einsaetze: d.einsaetze as any,
      abwesenheiten: d.abwesenheiten as any,
      einrichtungen: d.einrichtungen as any,
      dateRange,
    });
  }

  async function exportPlanungslistePDF() {
    const d = await loadPlan();
    const dateRange = eachDayOfInterval({ start: new Date(von), end: new Date(bis) });
    exportPlanungslistePdf({
      mitarbeiter: d.mitarbeiter as any,
      einsaetze: d.einsaetze as any,
      abwesenheiten: d.abwesenheiten as any,
      einrichtungen: d.einrichtungen as any,
      dateRange,
    });
  }

  // Wrapper to show errors uniformly
  const [busy, setBusy] = useState<string | null>(null);
  function run(key: string, fn: () => void | Promise<void>) {
    return async () => {
      if (busy) return;
      setBusy(key);
      try { await fn(); toast.success("Export erstellt"); }
      catch (e: any) { toast.error(e?.message ?? "Export fehlgeschlagen"); }
      finally { setBusy(null); }
    };
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Download className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Datei-Export</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Stammdaten und Planungsdaten als Excel- oder PDF-Datei exportieren.
      </p>

      <Card className="p-4 space-y-3">
        <h2 className="font-medium">Zeitraum (für Einsätze, Abwesenheiten & Planungsliste)</h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs">Von</Label>
            <Input type="date" value={von} onChange={(e) => setVon(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Bis</Label>
            <Input type="date" value={bis} onChange={(e) => setBis(e.target.value)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            setVon(isoDay(startOfMonth(today)));
            setBis(isoDay(endOfMonth(today)));
          }}>Aktueller Monat</Button>
        </div>
      </Card>

      <ExportRow
        title="Mitarbeiter"
        subtitle={`${maQ.data?.length ?? 0} Datensätze`}
        onExcel={run("ma-x", exportMitarbeiterExcel)}
        onPdf={run("ma-p", exportMitarbeiterPdf)}
        busy={busy}
        keys={["ma-x", "ma-p"]}
      />
      <ExportRow
        title="Einrichtungen"
        subtitle={`${einQ.data?.length ?? 0} Datensätze`}
        onExcel={run("ein-x", exportEinrichtungenExcel)}
        onPdf={run("ein-p", exportEinrichtungenPdf)}
        busy={busy}
        keys={["ein-x", "ein-p"]}
      />
      <ExportRow
        title="Einsätze (Dienstplan)"
        subtitle="Alle Einsätze im gewählten Zeitraum"
        onExcel={run("es-x", exportEinsaetzeExcel)}
        onPdf={run("es-p", exportEinsaetzePdf)}
        busy={busy}
        keys={["es-x", "es-p"]}
      />
      <ExportRow
        title="Abwesenheiten"
        subtitle="Alle Abwesenheiten im gewählten Zeitraum"
        onExcel={run("ab-x", exportAbwesenheitenExcel)}
        onPdf={run("ab-p", exportAbwesenheitenPdf)}
        busy={busy}
        keys={["ab-x", "ab-p"]}
      />
      <ExportRow
        title="Planungsliste (Matrix)"
        subtitle="Mitarbeiter × Tage im Zeitraum"
        onExcel={run("pl-x", exportPlanungslisteXlsx)}
        onPdf={run("pl-p", exportPlanungslistePDF)}
        busy={busy}
        keys={["pl-x", "pl-p"]}
      />
    </div>
  );
}

function ExportRow(props: {
  title: string; subtitle: string;
  onExcel: () => void; onPdf: () => void;
  busy: string | null; keys: [string, string];
}) {
  const xBusy = props.busy === props.keys[0];
  const pBusy = props.busy === props.keys[1];
  const anyBusy = props.busy !== null;
  return (
    <Card className="p-4 flex items-center justify-between gap-4">
      <div>
        <div className="font-medium">{props.title}</div>
        <div className="text-xs text-muted-foreground">{props.subtitle}</div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={props.onExcel} disabled={anyBusy}>
          <FileSpreadsheet className="h-4 w-4 mr-1" />
          {xBusy ? "Excel…" : "Excel"}
        </Button>
        <Button size="sm" variant="outline" onClick={props.onPdf} disabled={anyBusy}>
          <FileText className="h-4 w-4 mr-1" />
          {pBusy ? "PDF…" : "PDF"}
        </Button>
      </div>
    </Card>
  );
}
