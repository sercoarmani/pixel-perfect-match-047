import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMitarbeiter, upsertMitarbeiter, deleteMitarbeiter, getMitarbeiterDienstplan, getMitarbeiterDetail } from "@/lib/dispo.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Phone, FileText, FileSpreadsheet, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { generateDienstplanPdf } from "@/lib/pdf-dienstplan";
import { generateDienstplanExcel } from "@/lib/excel-dienstplan";
import { format, addDays } from "date-fns";


export const Route = createFileRoute("/_authenticated/mitarbeiter")({
  component: MitarbeiterPage,
});

const QUALS = ["PFK","PHK","GuK","PFA","PFM","PFF","Azubi","Berufserfahrung","LG1_LG2","Krankenschwester"] as const;
const ANSTS = ["Vollzeit","Teilzeit","Minijob"] as const;

function MitarbeiterPage() {
  const fetchList = useServerFn(listMitarbeiter);
  const { data, isLoading } = useQuery({ queryKey: ["mitarbeiter"], queryFn: () => fetchList() });
  const [edit, setEdit] = useState<any | null>(null);
  const [qualFilter, setQualFilter] = useState<string>("ALLE");
  const [anstFilter, setAnstFilter] = useState<string>("ALLE");
  const [statusFilter, setStatusFilter] = useState<"alle" | "aktiv" | "inaktiv">("aktiv");

  const filtered = (data ?? []).filter((m: any) => {
    if (qualFilter !== "ALLE" && m.qualifikation !== qualFilter) return false;
    if (anstFilter !== "ALLE" && m.anstellung !== anstFilter) return false;
    if (statusFilter !== "alle" && (statusFilter === "aktiv" ? !m.aktiv : m.aktiv)) return false;
    return true;
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Mitarbeiter</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} von {data?.length ?? 0} Mitarbeitern</p>
        </div>
        <Button onClick={() => setEdit({})}><Plus className="mr-1 h-4 w-4" /> Neu</Button>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="text-xs text-muted-foreground mr-1">Filter:</div>
        <Select value={qualFilter} onValueChange={setQualFilter}>
          <SelectTrigger className="h-8 w-[160px]"><SelectValue placeholder="Qualifikation" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALLE">Alle Qualifikationen</SelectItem>
            {QUALS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={anstFilter} onValueChange={setAnstFilter}>
          <SelectTrigger className="h-8 w-[150px]"><SelectValue placeholder="Anstellung" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALLE">Alle Anstellungen</SelectItem>
            {ANSTS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border bg-card p-0.5 text-xs">
          {(["aktiv", "inaktiv", "alle"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setStatusFilter(k)}
              className={"px-3 py-1 rounded capitalize " + (statusFilter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
            >
              {k}
            </button>
          ))}
        </div>
        {(qualFilter !== "ALLE" || anstFilter !== "ALLE" || statusFilter !== "aktiv") && (
          <Button size="sm" variant="ghost" onClick={() => { setQualFilter("ALLE"); setAnstFilter("ALLE"); setStatusFilter("aktiv"); }}>Zurücksetzen</Button>
        )}
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kürzel</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Qualifikation</TableHead>
              <TableHead>Anstellung</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead>Wohnort</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Lade…</TableCell></TableRow>}
            {filtered.map((m: any) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono cursor-pointer" onClick={() => setEdit(m)}>{m.kuerzel}</TableCell>
                <TableCell className="cursor-pointer" onClick={() => setEdit(m)}>{m.nachname}, {m.vorname}</TableCell>
                <TableCell><Badge variant="secondary">{m.qualifikation}</Badge></TableCell>
                <TableCell>{m.anstellung}</TableCell>
                <TableCell>
                  {m.telefon ? (
                    <a href={`tel:${m.telefon.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                      <Phone className="h-3 w-3" />{m.telefon}
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell>{m.wohnort ?? "—"}</TableCell>
                <TableCell>{m.aktiv ? <Badge>aktiv</Badge> : <Badge variant="outline">inaktiv</Badge>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <PdfButton mitarbeiter={m} />
                    <DeleteButton mitarbeiter={m} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {edit && <EditDialog row={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PdfButton({ mitarbeiter }: { mitarbeiter: any }) {
  const fetchPlan = useServerFn(getMitarbeiterDienstplan);
  const [loading, setLoading] = useState<null | "pdf" | "xlsx">(null);
  async function go(kind: "pdf" | "xlsx") {
    setLoading(kind);
    try {
      const von = format(new Date(), "yyyy-MM-dd");
      const bis = format(addDays(new Date(), 30), "yyyy-MM-dd");
      const res: any = await fetchPlan({ data: { mitarbeiter_id: mitarbeiter.id, von, bis } });
      const args = {
        mitarbeiter: res.mitarbeiter,
        einsaetze: res.einsaetze,
        abwesenheiten: res.abwesenheiten,
        von, bis,
      };
      if (kind === "pdf") generateDienstplanPdf(args);
      else generateDienstplanExcel(args);
    } catch (e: any) {
      toast.error(e.message ?? "Export fehlgeschlagen");
    } finally {
      setLoading(null);
    }
  }
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="outline" onClick={() => go("pdf")} disabled={loading !== null} title="Dienstplan PDF (nächste 30 Tage)">
        <FileText className="h-3.5 w-3.5 mr-1" /> PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => go("xlsx")} disabled={loading !== null} title="Dienstplan Excel (nächste 30 Tage)">
        <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Excel
      </Button>
    </div>
  );
}


function EditDialog({ row, onClose }: { row: any; onClose: () => void }) {
  const [form, setForm] = useState({
    id: row.id,
    vorname: row.vorname ?? "",
    nachname: row.nachname ?? "",
    kuerzel: row.kuerzel ?? "",
    qualifikation: row.qualifikation ?? "PFK",
    anstellung: row.anstellung ?? "Vollzeit",
    telefon: row.telefon ?? "",
    email: row.email ?? "",
    wohnort: row.wohnort ?? "",
    notiz: row.notiz ?? "",
    aktiv: row.aktiv ?? true,
  });
  const save = useServerFn(upsertMitarbeiter);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => save({ data: form as any }),
    onSuccess: () => { toast.success("Gespeichert"); qc.invalidateQueries({ queryKey: ["mitarbeiter"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{row.id ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle></DialogHeader>
        {row.id ? (
          <Tabs defaultValue="stamm">
            <TabsList>
              <TabsTrigger value="stamm">Stammdaten</TabsTrigger>
              <TabsTrigger value="verkn">Verfügbarkeiten & Dienste</TabsTrigger>
            </TabsList>
            <TabsContent value="stamm">
              <StammFields form={form} setForm={setForm} />
            </TabsContent>
            <TabsContent value="verkn">
              <MitarbeiterVerknuepft mitarbeiterId={row.id} />
            </TabsContent>
          </Tabs>
        ) : (
          <StammFields form={form} setForm={setForm} />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StammFields({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-sm pt-2">
      <Field label="Vorname"><Input value={form.vorname} onChange={(e) => setForm({...form, vorname: e.target.value})} /></Field>
      <Field label="Nachname"><Input value={form.nachname} onChange={(e) => setForm({...form, nachname: e.target.value})} /></Field>
      <Field label="Kürzel"><Input value={form.kuerzel} onChange={(e) => setForm({...form, kuerzel: e.target.value})} /></Field>
      <Field label="Qualifikation">
        <Select value={form.qualifikation} onValueChange={(v) => setForm({...form, qualifikation: v})}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{QUALS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Anstellung">
        <Select value={form.anstellung} onValueChange={(v) => setForm({...form, anstellung: v})}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{ANSTS.map((q) => <SelectItem key={q} value={q}>{q}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Telefon"><Input value={form.telefon} onChange={(e) => setForm({...form, telefon: e.target.value})} /></Field>
      <Field label="E-Mail"><Input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} /></Field>
      <Field label="Wohnort"><Input value={form.wohnort} onChange={(e) => setForm({...form, wohnort: e.target.value})} /></Field>
      <div className="space-y-1.5 col-span-2">
        <Label>Status</Label>
        <div className="flex items-center gap-3 rounded border bg-card px-3 py-2">
          <input id="ma-aktiv-tog" type="checkbox" checked={form.aktiv} onChange={(e) => setForm({...form, aktiv: e.target.checked})} className="h-4 w-4" />
          <label htmlFor="ma-aktiv-tog" className="text-sm cursor-pointer">{form.aktiv ? "Aktiv – wird in Planung & Listen angezeigt" : "Inaktiv – ausgeblendet"}</label>
        </div>
      </div>
    </div>
  );
}

function MitarbeiterVerknuepft({ mitarbeiterId }: { mitarbeiterId: string }) {
  const fetchDetail = useServerFn(getMitarbeiterDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["mitarbeiter-detail", mitarbeiterId],
    queryFn: () => fetchDetail({ data: { mitarbeiter_id: mitarbeiterId } }),
  });
  if (isLoading) return <div className="py-6 text-sm text-muted-foreground">Lade…</div>;
  const verf = data?.verfuegbarkeiten ?? [];
  const eins = data?.einsaetze ?? [];
  const anf = data?.anfragen ?? [];
  return (
    <div className="space-y-4 pt-3 text-sm">
      <section>
        <h3 className="font-medium mb-2">Verfügbarkeiten ({verf.length})</h3>
        {verf.length === 0 ? <p className="text-muted-foreground text-xs">Keine Verfügbarkeiten erfasst.</p> : (
          <div className="rounded border bg-card max-h-48 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Dienst</TableHead><TableHead>Status</TableHead><TableHead>Quelle</TableHead></TableRow></TableHeader>
              <TableBody>
                {verf.map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell className="tabular-nums">{format(new Date(v.datum), "dd.MM.yyyy")}</TableCell>
                    <TableCell>{v.dienst}</TableCell>
                    <TableCell>{v.verfuegbar ? <Badge>verfügbar</Badge> : <Badge variant="outline">nicht verfügbar</Badge>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{v.quelle}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section>
        <h3 className="font-medium mb-2">Besetzte Anfragen ({anf.length})</h3>
        {anf.length === 0 ? <p className="text-muted-foreground text-xs">Keine Anfragen besetzt.</p> : (
          <div className="rounded border bg-card max-h-40 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Typ</TableHead><TableHead>Zeitraum</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {anf.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{a.typ}</TableCell>
                    <TableCell className="tabular-nums text-xs">{format(new Date(a.zeitraum_von), "dd.MM.")}–{format(new Date(a.zeitraum_bis), "dd.MM.yyyy")}</TableCell>
                    <TableCell><Badge variant="secondary">{a.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <section>
        <h3 className="font-medium mb-2">Kommende Einsätze ({eins.length})</h3>
        {eins.length === 0 ? <p className="text-muted-foreground text-xs">Keine geplanten Einsätze.</p> : (
          <div className="rounded border bg-card max-h-48 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Datum</TableHead><TableHead>Dienst</TableHead><TableHead>Einrichtung</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {eins.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="tabular-nums">{format(new Date(e.datum), "dd.MM.yyyy")}</TableCell>
                    <TableCell>{e.dienst}</TableCell>
                    <TableCell>{e.einrichtung?.name ?? "—"}{e.einrichtung?.ort ? `, ${e.einrichtung.ort}` : ""}</TableCell>
                    <TableCell><Badge variant="secondary">{e.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function DeleteButton({ mitarbeiter }: { mitarbeiter: any }) {
  const del = useServerFn(deleteMitarbeiter);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id: mitarbeiter.id } }),
    onSuccess: () => { toast.success("Mitarbeiter gelöscht"); qc.invalidateQueries({ queryKey: ["mitarbeiter"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive" title="Löschen">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mitarbeiter löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            {mitarbeiter.nachname}, {mitarbeiter.vorname} ({mitarbeiter.kuerzel}) wird unwiderruflich gelöscht. Zugehörige Einsätze und Abwesenheiten werden ebenfalls entfernt.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Löschen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
