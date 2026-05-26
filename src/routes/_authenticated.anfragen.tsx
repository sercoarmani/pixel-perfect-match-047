import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addDays, format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Copy, MessageCircle, Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { listAnfragen, createAnfrage, listMitarbeiter, listEinrichtungen, listTemplates } from "@/lib/dispo.functions";

export const Route = createFileRoute("/_authenticated/anfragen")({
  component: AnfragenPage,
});

function AnfragenPage() {
  const fetchAnf = useServerFn(listAnfragen);
  const fetchMit = useServerFn(listMitarbeiter);
  const fetchEin = useServerFn(listEinrichtungen);
  const fetchTpl = useServerFn(listTemplates);

  const anfQ = useQuery({ queryKey: ["anfragen"], queryFn: () => fetchAnf() });
  const mitQ = useQuery({ queryKey: ["mitarbeiter"], queryFn: () => fetchMit() });
  const einQ = useQuery({ queryKey: ["einrichtungen"], queryFn: () => fetchEin() });
  const tplQ = useQuery({ queryKey: ["templates"], queryFn: () => fetchTpl() });

  const [open, setOpen] = useState(false);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    mitQ.data?.forEach((x: any) => m.set(x.id, `${x.kuerzel} – ${x.nachname}, ${x.vorname}`));
    einQ.data?.forEach((x: any) => m.set(x.id, x.name));
    return m;
  }, [mitQ.data, einQ.data]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Anfragen</h1>
          <p className="text-sm text-muted-foreground">Verfügbarkeits- und Bedarfsabfragen per Token-Link</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Neue Anfrage</Button>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Typ</TableHead>
              <TableHead>Empfänger</TableHead>
              <TableHead>Zeitraum</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Erstellt</TableHead>
              <TableHead>Link / Nachricht</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {anfQ.data?.map((a: any) => (
              <AnfrageRow key={a.id} a={a} name={nameById.get(a.empfaenger_id) ?? ""}
                templates={tplQ.data ?? []}
                mitarbeiter={mitQ.data ?? []} einrichtungen={einQ.data ?? []} />
            ))}
          </TableBody>
        </Table>
      </div>
      {open && (
        <NewAnfrageDialog
          onClose={() => setOpen(false)}
          mitarbeiter={mitQ.data ?? []}
          einrichtungen={einQ.data ?? []}
        />
      )}
    </div>
  );
}

function AnfrageRow({ a, name, templates, mitarbeiter, einrichtungen }: any) {
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/${a.typ === "verfuegbarkeit" ? "v" : "b"}/${a.token}`
    : "";

  const tplKey = a.typ === "verfuegbarkeit" ? "anfrage_verfuegbarkeit" : "anfrage_bedarf";
  const tpl = templates.find((t: any) => t.schluessel === tplKey)?.text ?? "";
  const empf = a.empfaenger_typ === "mitarbeiter"
    ? mitarbeiter.find((x: any) => x.id === a.empfaenger_id)
    : einrichtungen.find((x: any) => x.id === a.empfaenger_id);

  const msg = tpl
    .replaceAll("{name}", empf?.vorname ?? empf?.name ?? "")
    .replaceAll("{zeitraum}", `${format(new Date(a.zeitraum_von), "dd.MM.")}–${format(new Date(a.zeitraum_bis), "dd.MM.yyyy")}`)
    .replaceAll("{link}", url);

  const phone = (empf?.telefon ?? empf?.kontakt_telefon ?? "").replace(/[^0-9+]/g, "");
  const email = empf?.email ?? empf?.kontakt_email ?? "";

  return (
    <TableRow>
      <TableCell><Badge variant={a.typ === "verfuegbarkeit" ? "default" : "secondary"}>{a.typ}</Badge></TableCell>
      <TableCell className="text-sm">{name}</TableCell>
      <TableCell className="text-xs tabular-nums">
        {format(new Date(a.zeitraum_von), "dd.MM.")}–{format(new Date(a.zeitraum_bis), "dd.MM.yyyy")}
      </TableCell>
      <TableCell><StatusBadge status={a.status} /></TableCell>
      <TableCell className="text-xs">{format(new Date(a.erstellt_am), "dd.MM.yy HH:mm")}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link kopiert"); }}>
            <Copy className="h-3 w-3" />
          </Button>
          {phone && (
            <a href={`https://wa.me/${phone.replace("+","")}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noopener">
              <Button size="sm" variant="outline"><MessageCircle className="h-3 w-3" /></Button>
            </a>
          )}
          {phone && (
            <a href={`sms:${phone}?&body=${encodeURIComponent(msg)}`}>
              <Button size="sm" variant="outline"><Phone className="h-3 w-3" /></Button>
            </a>
          )}
          {email && (
            <a href={`mailto:${email}?subject=${encodeURIComponent("Disposition")}&body=${encodeURIComponent(msg)}`}>
              <Button size="sm" variant="outline"><Mail className="h-3 w-3" /></Button>
            </a>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "offen" ? "" : status === "beantwortet" ? "bg-status-bestaetigt text-status-bestaetigt-fg" : "bg-status-ausgeplant text-status-ausgeplant-fg";
  return <Badge className={cls}>{status}</Badge>;
}

function NewAnfrageDialog({ onClose, mitarbeiter, einrichtungen }: any) {
  const [typ, setTyp] = useState<"verfuegbarkeit" | "bedarf">("verfuegbarkeit");
  const [empfId, setEmpfId] = useState("");
  const [von, setVon] = useState(format(new Date(), "yyyy-MM-dd"));
  const [bis, setBis] = useState(format(addDays(new Date(), 14), "yyyy-MM-dd"));

  const create = useServerFn(createAnfrage);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => create({ data: {
      typ,
      empfaenger_typ: typ === "verfuegbarkeit" ? "mitarbeiter" : "einrichtung",
      empfaenger_id: empfId,
      zeitraum_von: von,
      zeitraum_bis: bis,
    } }),
    onSuccess: () => { toast.success("Anfrage erstellt"); qc.invalidateQueries({ queryKey: ["anfragen"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = typ === "verfuegbarkeit" ? mitarbeiter : einrichtungen;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Neue Anfrage</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <Select value={typ} onValueChange={(v) => { setTyp(v as any); setEmpfId(""); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="verfuegbarkeit">Verfügbarkeit (Mitarbeiter)</SelectItem>
                <SelectItem value="bedarf">Bedarf (Einrichtung)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Empfänger</Label>
            <Select value={empfId} onValueChange={setEmpfId}>
              <SelectTrigger><SelectValue placeholder="Auswählen…" /></SelectTrigger>
              <SelectContent>
                {options.map((o: any) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.kuerzel ? `${o.kuerzel} – ${o.nachname}, ${o.vorname}` : o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Von</Label><Input type="date" value={von} onChange={(e) => setVon(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Bis</Label><Input type="date" value={bis} onChange={(e) => setBis(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !empfId}>Anfrage anlegen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
