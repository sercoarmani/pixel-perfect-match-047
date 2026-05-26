import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEinrichtungen, upsertEinrichtung, deleteEinrichtung } from "@/lib/dispo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/einrichtungen")({
  component: EinrichtungenPage,
});

function EinrichtungenPage() {
  const fetchList = useServerFn(listEinrichtungen);
  const { data, isLoading } = useQuery({ queryKey: ["einrichtungen"], queryFn: () => fetchList() });
  const [edit, setEdit] = useState<any | null>(null);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Einrichtungen</h1>
          <p className="text-sm text-muted-foreground">{data?.length ?? 0} Einrichtungen</p>
        </div>
        <Button onClick={() => setEdit({})}><Plus className="mr-1 h-4 w-4" /> Neu</Button>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Ort</TableHead>
              <TableHead>Träger</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead>VS PFK</TableHead>
              <TableHead>VS PHK</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="text-muted-foreground">Lade…</TableCell></TableRow>}
            {data?.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="font-medium cursor-pointer" onClick={() => setEdit(e)}>{e.name}</TableCell>
                <TableCell className="cursor-pointer" onClick={() => setEdit(e)}>{e.ort ?? "—"}</TableCell>
                <TableCell>{e.traeger?.name ?? "—"}</TableCell>
                <TableCell className="text-xs">{e.kontakt_name ?? "—"}<br/>{e.kontakt_telefon ?? ""}</TableCell>
                <TableCell>{e.vs_satz_pfk ? `${e.vs_satz_pfk} €` : "—"}</TableCell>
                <TableCell>{e.vs_satz_phk ? `${e.vs_satz_phk} €` : "—"}</TableCell>
                <TableCell>{e.aktiv ? <Badge>aktiv</Badge> : <Badge variant="outline">inaktiv</Badge>}</TableCell>
                <TableCell className="text-right"><DeleteEinrichtungButton einrichtung={e} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {edit && <EditDialog row={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EditDialog({ row, onClose }: { row: any; onClose: () => void }) {
  const [form, setForm] = useState({
    id: row.id,
    name: row.name ?? "",
    ort: row.ort ?? "",
    wohnbereich: row.wohnbereich ?? "",
    kontakt_name: row.kontakt_name ?? "",
    kontakt_telefon: row.kontakt_telefon ?? "",
    kontakt_email: row.kontakt_email ?? "",
    vs_satz_pfk: row.vs_satz_pfk ?? null,
    vs_satz_phk: row.vs_satz_phk ?? null,
    notiz: row.notiz ?? "",
    aktiv: row.aktiv ?? true,
  });
  const save = useServerFn(upsertEinrichtung);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => save({ data: {
      ...form,
      vs_satz_pfk: form.vs_satz_pfk ? Number(form.vs_satz_pfk) : null,
      vs_satz_phk: form.vs_satz_phk ? Number(form.vs_satz_phk) : null,
    } as any }),
    onSuccess: () => { toast.success("Gespeichert"); qc.invalidateQueries({ queryKey: ["einrichtungen"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{row.id ? "Einrichtung bearbeiten" : "Neue Einrichtung"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <F label="Name" full><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></F>
          <F label="Ort"><Input value={form.ort} onChange={(e) => setForm({...form, ort: e.target.value})} /></F>
          <F label="Wohnbereich"><Input value={form.wohnbereich} onChange={(e) => setForm({...form, wohnbereich: e.target.value})} /></F>
          <F label="Kontaktperson"><Input value={form.kontakt_name} onChange={(e) => setForm({...form, kontakt_name: e.target.value})} /></F>
          <F label="Telefon"><Input value={form.kontakt_telefon} onChange={(e) => setForm({...form, kontakt_telefon: e.target.value})} /></F>
          <F label="E-Mail" full><Input type="email" value={form.kontakt_email} onChange={(e) => setForm({...form, kontakt_email: e.target.value})} /></F>
          <F label="VS-Satz PFK (€)"><Input type="number" step="0.01" value={form.vs_satz_pfk ?? ""} onChange={(e) => setForm({...form, vs_satz_pfk: e.target.value as any})} /></F>
          <F label="VS-Satz PHK (€)"><Input type="number" step="0.01" value={form.vs_satz_phk ?? ""} onChange={(e) => setForm({...form, vs_satz_phk: e.target.value as any})} /></F>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={"space-y-1.5 " + (full ? "col-span-2" : "")}><Label>{label}</Label>{children}</div>;
}
