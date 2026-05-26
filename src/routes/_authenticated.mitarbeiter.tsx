import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMitarbeiter, upsertMitarbeiter, deleteMitarbeiter, getMitarbeiterDienstplan } from "@/lib/dispo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Phone, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { generateDienstplanPdf } from "@/lib/pdf-dienstplan";
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

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mitarbeiter</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} Mitarbeiter</p>
        </div>
        <Button onClick={() => setEdit({})}><Plus className="mr-1 h-4 w-4" /> Neu</Button>
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
            {data?.map((m: any) => (
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
                  <PdfButton mitarbeiter={m} />
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
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    try {
      const von = format(new Date(), "yyyy-MM-dd");
      const bis = format(addDays(new Date(), 30), "yyyy-MM-dd");
      const res: any = await fetchPlan({ data: { mitarbeiter_id: mitarbeiter.id, von, bis } });
      generateDienstplanPdf({
        mitarbeiter: res.mitarbeiter,
        einsaetze: res.einsaetze,
        abwesenheiten: res.abwesenheiten,
        von, bis,
      });
    } catch (e: any) {
      toast.error(e.message ?? "PDF konnte nicht erstellt werden");
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={go} disabled={loading} title="Dienstplan PDF (nächste 30 Tage)">
      <FileText className="h-3.5 w-3.5 mr-1" /> Dienstplan
    </Button>
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
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{row.id ? "Mitarbeiter bearbeiten" : "Neuer Mitarbeiter"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
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
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
