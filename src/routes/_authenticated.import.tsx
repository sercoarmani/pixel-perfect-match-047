import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as XLSX from "xlsx";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Download, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import {
  importMitarbeiter, importEinrichtungen,
  importEinsaetze, importAbwesenheiten,
} from "@/lib/dispo.functions";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
});

type EntityKey = "mitarbeiter" | "einrichtungen" | "einsaetze" | "abwesenheiten";

type Spec = {
  key: EntityKey;
  label: string;
  description: string;
  columns: { key: string; label: string; required?: boolean; hint?: string }[];
  sample: Record<string, string | number>[];
};

const SPECS: Record<EntityKey, Spec> = {
  mitarbeiter: {
    key: "mitarbeiter",
    label: "Mitarbeiter",
    description: "Import / Update über Spalte 'kuerzel' (eindeutig).",
    columns: [
      { key: "vorname", label: "vorname", required: true },
      { key: "nachname", label: "nachname", required: true },
      { key: "kuerzel", label: "kuerzel", required: true, hint: "Eindeutig" },
      { key: "qualifikation", label: "qualifikation", hint: "PFK | PHK" },
      { key: "telefon", label: "telefon" },
      { key: "email", label: "email" },
      { key: "wohnort", label: "wohnort" },
      { key: "anstellung", label: "anstellung", hint: "Vollzeit | Teilzeit | Minijob" },
      { key: "notiz", label: "notiz" },
    ],
    sample: [
      { vorname: "Anna", nachname: "Beispiel", kuerzel: "AB", qualifikation: "PFK", telefon: "+49 170 1234567", email: "anna@example.com", wohnort: "Berlin", anstellung: "Vollzeit", notiz: "" },
    ],
  },
  einrichtungen: {
    key: "einrichtungen",
    label: "Einrichtungen",
    description: "Träger werden bei Bedarf automatisch angelegt.",
    columns: [
      { key: "name", label: "name", required: true, hint: "Eindeutig" },
      { key: "traeger", label: "traeger" },
      { key: "ort", label: "ort" },
      { key: "wohnbereich", label: "wohnbereich" },
      { key: "kontakt_name", label: "kontakt_name" },
      { key: "kontakt_telefon", label: "kontakt_telefon" },
      { key: "kontakt_email", label: "kontakt_email" },
      { key: "vs_satz_pfk", label: "vs_satz_pfk", hint: "Zahl" },
      { key: "vs_satz_phk", label: "vs_satz_phk", hint: "Zahl" },
      { key: "notiz", label: "notiz" },
    ],
    sample: [
      { name: "Haus Sonnenschein", traeger: "Beispiel-Träger", ort: "Berlin", wohnbereich: "WB1", kontakt_name: "Frau Muster", kontakt_telefon: "+49 30 123456", kontakt_email: "info@example.com", vs_satz_pfk: 38.5, vs_satz_phk: 28, notiz: "" },
    ],
  },
  einsaetze: {
    key: "einsaetze",
    label: "Einsätze (Dienstplan)",
    description: "Bezug per Mitarbeiter-Kürzel und Einrichtungs-Name. Vorhandene Einsätze (Datum+Dienst) werden aktualisiert.",
    columns: [
      { key: "mitarbeiter_kuerzel", label: "mitarbeiter_kuerzel", required: true },
      { key: "einrichtung_name", label: "einrichtung_name", required: true },
      { key: "datum", label: "datum", required: true, hint: "TT.MM.JJJJ oder JJJJ-MM-TT" },
      { key: "dienst", label: "dienst", required: true, hint: "F | S | N" },
      { key: "status", label: "status", hint: "GEPLANT | BESTAETIGT | …" },
      { key: "notiz", label: "notiz" },
    ],
    sample: [
      { mitarbeiter_kuerzel: "AB", einrichtung_name: "Haus Sonnenschein", datum: "01.06.2026", dienst: "F", status: "GEPLANT", notiz: "" },
    ],
  },
  abwesenheiten: {
    key: "abwesenheiten",
    label: "Abwesenheiten",
    description: "Eintrag pro Tag. Wird neu angelegt.",
    columns: [
      { key: "mitarbeiter_kuerzel", label: "mitarbeiter_kuerzel", required: true },
      { key: "datum", label: "datum", required: true, hint: "TT.MM.JJJJ oder JJJJ-MM-TT" },
      { key: "art", label: "art", required: true, hint: "Urlaub | Wunschfrei | krank_mit_AU | krank_ohne_AU | unbezahlter_Urlaub" },
      { key: "notiz", label: "notiz" },
    ],
    sample: [
      { mitarbeiter_kuerzel: "AB", datum: "10.06.2026", art: "Urlaub", notiz: "" },
    ],
  },
};

function parseExcelToRows(file: File, spec: Spec): Promise<Record<string, any>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: null, raw: false });
        const allowed = new Set(spec.columns.map((c) => c.key));
        const rows = raw.map((r) => {
          const out: Record<string, any> = {};
          for (const k of Object.keys(r)) {
            const key = k.trim().toLowerCase().replace(/[\s-]+/g, "_");
            if (allowed.has(key)) {
              const v = r[k];
              if (v === "" || v === null) continue;
              if ((key === "vs_satz_pfk" || key === "vs_satz_phk") && typeof v === "string") {
                const n = Number(v.replace(",", "."));
                out[key] = Number.isFinite(n) ? n : null;
              } else {
                out[key] = v;
              }
            }
          }
          return out;
        }).filter((r) => Object.keys(r).length > 0);
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function downloadTemplate(spec: Spec) {
  const ws = XLSX.utils.json_to_sheet(spec.sample);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, spec.label.substring(0, 30));
  XLSX.writeFile(wb, `Vorlage_${spec.key}.xlsx`);
}

function ImportPanel({ spec }: { spec: Spec }) {
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [result, setResult] = useState<any>(null);

  const importFn = useServerFn(
    spec.key === "mitarbeiter" ? importMitarbeiter :
    spec.key === "einrichtungen" ? importEinrichtungen :
    spec.key === "einsaetze" ? importEinsaetze :
    importAbwesenheiten
  );

  const mut = useMutation({
    mutationFn: async () => importFn({ data: { rows } as any }),
    onSuccess: (res: any) => {
      setResult(res);
      toast.success(`Import abgeschlossen: ${res.created ?? 0} neu, ${res.updated ?? 0} aktualisiert`);
    },
    onError: (e: any) => toast.error(e.message ?? "Import fehlgeschlagen"),
  });

  async function onFile(f: File) {
    setResult(null);
    try {
      const parsed = await parseExcelToRows(f, spec);
      setRows(parsed);
      setFilename(f.name);
      if (parsed.length === 0) toast.warning("Keine verwertbaren Zeilen gefunden");
      else toast.success(`${parsed.length} Zeilen eingelesen`);
    } catch (e: any) {
      toast.error("Datei konnte nicht gelesen werden: " + e.message);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="font-semibold mb-1">{spec.label}</h3>
        <p className="text-sm text-muted-foreground mb-3">{spec.description}</p>
        <div className="overflow-x-auto rounded border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr><th className="px-2 py-1 text-left">Spalte</th><th className="px-2 py-1 text-left">Pflicht</th><th className="px-2 py-1 text-left">Hinweis</th></tr>
            </thead>
            <tbody>
              {spec.columns.map((c) => (
                <tr key={c.key} className="border-t">
                  <td className="px-2 py-1 font-mono">{c.label}</td>
                  <td className="px-2 py-1">{c.required ? "ja" : "—"}</td>
                  <td className="px-2 py-1 text-muted-foreground">{c.hint ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate(spec)}>
            <Download className="h-4 w-4 mr-2" /> Vorlage herunterladen
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-3 hover:bg-muted/40 flex-1">
            <Upload className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">
              {filename ? <><b>{filename}</b> – {rows.length} Zeilen</> : "Excel-Datei wählen (.xlsx)"}
            </span>
          </div>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
          />
        </label>

        {rows.length > 0 && (
          <>
            <div className="mt-4 overflow-x-auto rounded border max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    {spec.columns.map((c) => <th key={c.key} className="px-2 py-1 text-left">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i} className="border-t">
                      {spec.columns.map((c) => (
                        <td key={c.key} className="px-2 py-1 whitespace-nowrap">{r[c.key] ?? ""}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && <div className="p-2 text-xs text-muted-foreground">… {rows.length - 50} weitere Zeilen</div>}
            </div>

            <div className="mt-4 flex justify-end">
              <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
                {mut.isPending ? "Importiere…" : <><FileSpreadsheet className="h-4 w-4 mr-2" /> {rows.length} Zeilen importieren</>}
              </Button>
            </div>
          </>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-status-bestaetigt" />
              <span>Neu: <b>{result.created ?? 0}</b> · Aktualisiert: <b>{result.updated ?? 0}</b> · Fehler: <b>{result.errors?.length ?? 0}</b></span>
            </div>
            {result.errors?.length > 0 && (
              <div className="rounded border bg-destructive/5 p-3 text-xs space-y-1 max-h-40 overflow-auto">
                {result.errors.map((e: any, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <AlertCircle className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
                    <span>{e.kuerzel ?? e.name ?? `Zeile ${e.row}`}: {e.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function ImportPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Excel-Import</h1>
      <p className="text-muted-foreground mb-6">Stammdaten und Plandaten aus Excel-Listen einlesen.</p>
      <Tabs defaultValue="mitarbeiter">
        <TabsList>
          <TabsTrigger value="mitarbeiter">Mitarbeiter</TabsTrigger>
          <TabsTrigger value="einrichtungen">Einrichtungen</TabsTrigger>
          <TabsTrigger value="einsaetze">Einsätze</TabsTrigger>
          <TabsTrigger value="abwesenheiten">Abwesenheiten</TabsTrigger>
        </TabsList>
        {(Object.keys(SPECS) as EntityKey[]).map((k) => (
          <TabsContent key={k} value={k} className="mt-4">
            <ImportPanel spec={SPECS[k]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
