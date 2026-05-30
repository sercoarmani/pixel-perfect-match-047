import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEinrichtungen, upsertEinrichtung, deleteEinrichtung, listTraeger, createTraeger } from "@/lib/dispo.functions";
import { generatePortalToken } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Link2, Copy } from "lucide-react";
import { toast } from "sonner";
import { GeocodeStatusBadge, GeocodeSingleButton, GeocodeBulkButton } from "@/components/geocode-status";

export const Route = createFileRoute("/_authenticated/einrichtungen")({
  component: EinrichtungenPage,
});

function EinrichtungenPage() {
  const fetchList = useServerFn(listEinrichtungen);
  const { data, isLoading } = useQuery({ queryKey: ["einrichtungen"], queryFn: () => fetchList() });
  const [edit, setEdit] = useState<any | null>(null);
  const [filter, setFilter] = useState<"alle" | "aktiv" | "inaktiv">("alle");

  const filtered = (data ?? []).filter((e: any) =>
    filter === "alle" ? true : filter === "aktiv" ? e.aktiv : !e.aktiv,
  );

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Einrichtungen</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} von {data?.length ?? 0} Einrichtungen</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border bg-card p-0.5 text-xs">
            {(["aktiv", "inaktiv", "alle"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={"px-3 py-1.5 rounded capitalize " + (filter === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              >
                {k}
              </button>
            ))}
          </div>
          <GeocodeBulkButton tabelle="einrichtungen" invalidateKey="einrichtungen" />
          <Button onClick={() => setEdit({})}><Plus className="mr-1 h-4 w-4" /> Neu</Button>
        </div>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Träger</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Ort</TableHead>
              <TableHead>Kontakt</TableHead>
              <TableHead>VS PFK</TableHead>
              <TableHead>VS PHK</TableHead>
              <TableHead>Geo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={9} className="text-muted-foreground">Lade…</TableCell></TableRow>}
            {filtered.map((e: any) => (
              <TableRow key={e.id}>
                <TableCell className="text-sm text-muted-foreground">{e.traeger?.name ?? "—"}</TableCell>
                <TableCell className="font-medium cursor-pointer" onClick={() => setEdit(e)}>{e.name}</TableCell>
                <TableCell className="cursor-pointer" onClick={() => setEdit(e)}>{e.ort ?? "—"}</TableCell>
                <TableCell className="text-xs">{e.kontakt_name ?? "—"}<br/>{e.kontakt_telefon ?? ""}</TableCell>
                <TableCell>{e.vs_satz_pfk ? `${e.vs_satz_pfk} €` : "—"}</TableCell>
                <TableCell>{e.vs_satz_phk ? `${e.vs_satz_phk} €` : "—"}</TableCell>
                <TableCell><GeocodeStatusBadge status={e.geocode_status} fehler={e.geocode_fehler} lat={e.lat} lng={e.lng} /></TableCell>
                <TableCell>{e.aktiv ? <Badge>aktiv</Badge> : <Badge variant="outline">inaktiv</Badge>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <PortalLinkButton einrichtung={e} />
                    <DeleteEinrichtungButton einrichtung={e} />
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

function EditDialog({ row, onClose }: { row: any; onClose: () => void }) {
  const [form, setForm] = useState({
    id: row.id,
    traeger_id: row.traeger_id ?? null,
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
  const fetchTraeger = useServerFn(listTraeger);
  const { data: traeger } = useQuery({ queryKey: ["traeger"], queryFn: () => fetchTraeger() });
  const createT = useServerFn(createTraeger);
  const qc = useQueryClient();
  const newTraeger = useMutation({
    mutationFn: (name: string) => createT({ data: { name } }),
    onSuccess: (t: any) => {
      qc.invalidateQueries({ queryKey: ["traeger"] });
      setForm((f) => ({ ...f, traeger_id: t.id }));
      toast.success("Träger angelegt");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useServerFn(upsertEinrichtung);
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
          <F label="Träger" full>
            <div className="flex gap-2">
              <Select value={form.traeger_id ?? "__none__"} onValueChange={(v) => setForm({...form, traeger_id: v === "__none__" ? null : v})}>
                <SelectTrigger><SelectValue placeholder="– Träger wählen –" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">– kein Träger –</SelectItem>
                  {(traeger ?? []).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const name = window.prompt("Neuer Träger – Name:");
                if (name && name.trim()) newTraeger.mutate(name.trim());
              }}>+ Neu</Button>
            </div>
          </F>
          <F label="Name" full><Input value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></F>
          <F label="Ort"><Input value={form.ort} onChange={(e) => setForm({...form, ort: e.target.value})} /></F>
          <F label="Wohnbereich"><Input value={form.wohnbereich} onChange={(e) => setForm({...form, wohnbereich: e.target.value})} /></F>
          <F label="Kontaktperson"><Input value={form.kontakt_name} onChange={(e) => setForm({...form, kontakt_name: e.target.value})} /></F>
          <F label="Telefon"><Input value={form.kontakt_telefon} onChange={(e) => setForm({...form, kontakt_telefon: e.target.value})} /></F>
          <F label="E-Mail" full><Input type="email" value={form.kontakt_email} onChange={(e) => setForm({...form, kontakt_email: e.target.value})} /></F>
          <F label="VS-Satz PFK (€)"><Input type="number" step="0.01" value={form.vs_satz_pfk ?? ""} onChange={(e) => setForm({...form, vs_satz_pfk: e.target.value as any})} /></F>
          <F label="VS-Satz PHK (€)"><Input type="number" step="0.01" value={form.vs_satz_phk ?? ""} onChange={(e) => setForm({...form, vs_satz_phk: e.target.value as any})} /></F>
          <F label="Status" full>
            <div className="flex items-center gap-3 rounded border bg-card px-3 py-2">
              <input id="aktiv-tog" type="checkbox" checked={form.aktiv} onChange={(e) => setForm({...form, aktiv: e.target.checked})} className="h-4 w-4" />
              <label htmlFor="aktiv-tog" className="text-sm cursor-pointer">{form.aktiv ? "Aktiv – wird in Listen & Planung angezeigt" : "Inaktiv – ausgeblendet"}</label>
            </div>
          </F>
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

function DeleteEinrichtungButton({ einrichtung }: { einrichtung: any }) {
  const del = useServerFn(deleteEinrichtung);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => del({ data: { id: einrichtung.id } }),
    onSuccess: () => { toast.success("Einrichtung gelöscht"); qc.invalidateQueries({ queryKey: ["einrichtungen"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="ghost" className="text-destructive" title="Löschen" onClick={(e) => e.stopPropagation()}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Einrichtung löschen?</AlertDialogTitle>
          <AlertDialogDescription>
            „{einrichtung.name}" wird unwiderruflich gelöscht. Zugehörige Einsätze und Bedarfe werden ebenfalls entfernt.
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

function PortalLinkButton({ einrichtung }: { einrichtung: any }) {
  const gen = useServerFn(generatePortalToken);
  const qc = useQueryClient();
  const buildUrl = (token: string) => `${window.location.origin}/kunde/${token}`;
  const m = useMutation({
    mutationFn: () => gen({ data: { einrichtung_id: einrichtung.id } }),
    onSuccess: (r) => {
      navigator.clipboard.writeText(buildUrl(r.token));
      toast.success("Neuer Portal-Link kopiert");
      qc.invalidateQueries({ queryKey: ["einrichtungen"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (einrichtung.portal_token) {
    return (
      <Button
        size="sm"
        variant="ghost"
        title="Portal-Link kopieren"
        onClick={(e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(buildUrl(einrichtung.portal_token));
          toast.success("Portal-Link kopiert");
        }}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    );
  }
  return (
    <Button size="sm" variant="ghost" title="Portal-Link erzeugen" onClick={(e) => { e.stopPropagation(); m.mutate(); }} disabled={m.isPending}>
      <Link2 className="h-3.5 w-3.5" />
    </Button>
  );
}
