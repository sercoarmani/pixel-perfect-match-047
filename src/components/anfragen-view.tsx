import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addDays, format, parseISO, isWithinInterval } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Copy, MessageCircle, Mail, PhoneCall } from "lucide-react";
import { toast } from "sonner";
import {
  listAnfragen, createAnfrage, listMitarbeiter, listEinrichtungen, listTemplates, listOffeneBedarfe,
} from "@/lib/dispo.functions";

export type AnfragenScope = "kunden" | "mitarbeiter";

const SCOPE_CONFIG: Record<AnfragenScope, {
  title: string;
  subtitle: string;
  typ: "bedarf" | "verfuegbarkeit";
  empfaengerTyp: "einrichtung" | "mitarbeiter";
  empfLabel: string;
}> = {
  kunden: {
    title: "Anfragen von Kunden",
    subtitle: "Bedarfsabfragen an Einrichtungen per Token-Link – inkl. offener Dispo-Bedarfe",
    typ: "bedarf",
    empfaengerTyp: "einrichtung",
    empfLabel: "Kunde",
  },
  mitarbeiter: {
    title: "Verfügbarkeiten der Mitarbeiter",
    subtitle: "Verfügbarkeitsabfragen an Mitarbeiter per Token-Link",
    typ: "verfuegbarkeit",
    empfaengerTyp: "mitarbeiter",
    empfLabel: "Empfänger",
  },
};

const DIENST_LABEL: Record<string, string> = { F: "Früh", S: "Spät", N: "Nacht" };

function normalizePhone(p?: string | null) {
  if (!p) return "";
  return p.replace(/[^\d+]/g, "");
}

export function AnfragenView({ scope }: { scope: AnfragenScope }) {
  const cfg = SCOPE_CONFIG[scope];
  const fetchAnf = useServerFn(listAnfragen);
  const fetchMit = useServerFn(listMitarbeiter);
  const fetchEin = useServerFn(listEinrichtungen);
  const fetchTpl = useServerFn(listTemplates);
  const fetchBed = useServerFn(listOffeneBedarfe);

  const anfQ = useQuery({ queryKey: ["anfragen"], queryFn: () => fetchAnf() });
  const mitQ = useQuery({ queryKey: ["mitarbeiter"], queryFn: () => fetchMit() });
  const einQ = useQuery({ queryKey: ["einrichtungen"], queryFn: () => fetchEin() });
  const tplQ = useQuery({ queryKey: ["templates"], queryFn: () => fetchTpl() });
  const bedQ = useQuery({
    queryKey: ["bedarfe-offen"],
    queryFn: () => fetchBed(),
    enabled: scope === "kunden",
  });

  const [open, setOpen] = useState(false);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    mitQ.data?.forEach((x: any) => m.set(x.id, `${x.kuerzel} – ${x.nachname}, ${x.vorname}`));
    einQ.data?.forEach((x: any) => m.set(x.id, x.name));
    return m;
  }, [mitQ.data, einQ.data]);

  const einById = useMemo(() => {
    const m = new Map<string, any>();
    einQ.data?.forEach((e: any) => m.set(e.id, e));
    return m;
  }, [einQ.data]);

  /** Dienste je Anfrage aus offenen Bedarfen ableiten (nur kunden-scope). */
  const diensteByAnfrage = useMemo(() => {
    const m = new Map<string, string[]>();
    if (scope !== "kunden" || !bedQ.data || !anfQ.data) return m;
    for (const a of anfQ.data) {
      if (a.empfaenger_typ !== "einrichtung") continue;
      const von = parseISO(a.zeitraum_von);
      const bis = parseISO(a.zeitraum_bis);
      const set = new Set<string>();
      for (const b of bedQ.data) {
        if (b.einrichtung_id !== a.empfaenger_id) continue;
        const d = parseISO(b.datum);
        if (isWithinInterval(d, { start: von, end: bis })) set.add(b.dienst);
      }
      if (set.size) m.set(a.id, Array.from(set));
    }
    return m;
  }, [scope, bedQ.data, anfQ.data]);

  type Row =
    | { kind: "anfrage"; id: string; sortDate: string; data: any }
    | { kind: "bedarf"; id: string; sortDate: string; data: any };

  const rows: Row[] = useMemo(() => {
    const anfRows: Row[] = (anfQ.data ?? [])
      .filter((a: any) => a.empfaenger_typ === cfg.empfaengerTyp)
      .map((a: any) => ({ kind: "anfrage" as const, id: a.id, sortDate: a.zeitraum_von, data: a }));

    if (scope !== "kunden") return anfRows;

    // Dedupe: pro (Datum × Dienst) nur eine virtuelle Bedarf-Zeile
    const bedSeen = new Set<string>();
    const bedRows: Row[] = [];
    for (const b of (bedQ.data ?? []) as any[]) {
      const key = `${b.datum}|${b.dienst}`;
      if (bedSeen.has(key)) continue;
      bedSeen.add(key);
      bedRows.push({ kind: "bedarf" as const, id: `bedarf:${b.id}`, sortDate: b.datum, data: b });
    }

    return [...anfRows, ...bedRows].sort((a, b) => a.sortDate.localeCompare(b.sortDate));
  }, [anfQ.data, bedQ.data, cfg.empfaengerTyp, scope]);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{cfg.title}</h1>
          <p className="text-sm text-muted-foreground">{cfg.subtitle}</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Neue Anfrage</Button>
      </div>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{cfg.empfLabel}</TableHead>
              <TableHead>Zeitraum</TableHead>
              {scope === "kunden" && <TableHead>Dienste</TableHead>}
              <TableHead>Status</TableHead>
              <TableHead>Erstellt</TableHead>
              <TableHead>Link / Nachricht</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => r.kind === "anfrage" ? (
              <AnfrageRow
                key={r.id}
                scope={scope}
                a={r.data}
                name={nameById.get(r.data.empfaenger_id) ?? ""}
                dienste={diensteByAnfrage.get(r.data.id) ?? []}
                templates={tplQ.data ?? []}
                mitarbeiter={mitQ.data ?? []}
                einrichtungen={einQ.data ?? []}
              />
            ) : (
              <BedarfRow key={r.id} b={r.data} ein={einById.get(r.data.einrichtung_id)} />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={scope === "kunden" ? 6 : 5} className="py-6 text-center text-sm text-muted-foreground">
                  Keine Einträge.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {open && (
        <NewAnfrageDialog
          scope={scope}
          onClose={() => setOpen(false)}
          mitarbeiter={mitQ.data ?? []}
          einrichtungen={einQ.data ?? []}
        />
      )}
    </div>
  );
}

function DiensteBadges({ dienste }: { dienste: string[] }) {
  if (!dienste.length) return <span className="text-xs text-muted-foreground">–</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {dienste.map((d) => (
        <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0">
          {DIENST_LABEL[d] ?? d}
        </Badge>
      ))}
    </div>
  );
}

function StatusBadge({ status, besetzt }: { status: string; besetzt?: boolean }) {
  // Visuelle Differenzierung offen / besetzt / abgelehnt
  let label = status;
  let cls = "";
  if (besetzt || status === "beantwortet" || status === "besetzt") {
    label = "besetzt";
    cls = "bg-status-bestaetigt text-status-bestaetigt-fg";
  } else if (status === "geschlossen" || status === "abgelehnt" || status === "abgelaufen") {
    label = "abgelehnt";
    cls = "bg-destructive text-destructive-foreground";
  } else if (status === "offen") {
    label = "offen";
  } else {
    cls = "bg-status-ausgeplant text-status-ausgeplant-fg";
  }
  return <Badge className={cls}>{label}</Badge>;
}

function ContactButtons({ msg, phone, email }: { msg: string; phone: string; email: string }) {
  const tel = normalizePhone(phone);
  const waNumber = tel.replace(/^\+/, "");
  return (
    <>
      {tel && (
        <a href={`https://wa.me/${waNumber}${msg ? `?text=${encodeURIComponent(msg)}` : ""}`} target="_blank" rel="noopener" title={`WhatsApp: ${phone}`}>
          <Button size="sm" variant="outline"><MessageCircle className="h-3 w-3" /></Button>
        </a>
      )}
      {tel && (
        <a href={`tel:${tel}`} title={`Anrufen: ${phone}`}>
          <Button size="sm" variant="outline"><PhoneCall className="h-3 w-3" /></Button>
        </a>
      )}
      {email && (
        <a href={`mailto:${email}${msg ? `?subject=${encodeURIComponent("Disposition")}&body=${encodeURIComponent(msg)}` : ""}`} title={`E-Mail: ${email}`}>
          <Button size="sm" variant="outline"><Mail className="h-3 w-3" /></Button>
        </a>
      )}
    </>
  );
}

function AnfrageRow({ scope, a, name, dienste, templates, mitarbeiter, einrichtungen }: any) {
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

  const phone = empf?.telefon ?? empf?.kontakt_telefon ?? "";
  const email = empf?.email ?? empf?.kontakt_email ?? "";

  return (
    <TableRow>
      <TableCell className="text-sm">{name}</TableCell>
      <TableCell className="text-xs tabular-nums">
        {format(new Date(a.zeitraum_von), "dd.MM.")}–{format(new Date(a.zeitraum_bis), "dd.MM.yyyy")}
      </TableCell>
      {scope === "kunden" && <TableCell><DiensteBadges dienste={dienste} /></TableCell>}
      <TableCell><StatusBadge status={a.status} besetzt={Boolean(a.besetzt_durch)} /></TableCell>
      <TableCell className="text-xs">{format(new Date(a.erstellt_am), "dd.MM.yy HH:mm")}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link kopiert"); }} title="Link kopieren">
            <Copy className="h-3 w-3" />
          </Button>
          <ContactButtons msg={msg} phone={phone} email={email} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function BedarfRow({ b, ein }: { b: any; ein: any }) {
  const phone = ein?.kontakt_telefon ?? "";
  const email = ein?.kontakt_email ?? "";
  const msg = `Bedarf am ${format(new Date(b.datum), "dd.MM.yyyy")} (${DIENST_LABEL[b.dienst] ?? b.dienst}) – ${b.qualifikation}`;
  const status = (b.ergebnis ?? b.status ?? "offen") as string;

  return (
    <TableRow className="bg-muted/30">
      <TableCell className="text-sm">
        <div className="flex items-center gap-2">
          <span>{ein?.name ?? "—"}</span>
          <Badge variant="outline" className="text-[10px]">Dispo</Badge>
        </div>
      </TableCell>
      <TableCell className="text-xs tabular-nums">{format(new Date(b.datum), "dd.MM.yyyy")}</TableCell>
      <TableCell><DiensteBadges dienste={[b.dienst]} /></TableCell>
      <TableCell><StatusBadge status={status} /></TableCell>
      <TableCell className="text-xs">{format(new Date(b.eingegangen_am), "dd.MM.yy HH:mm")}</TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <ContactButtons msg={msg} phone={phone} email={email} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function NewAnfrageDialog({ scope, onClose, mitarbeiter, einrichtungen }: { scope: AnfragenScope; onClose: () => void; mitarbeiter: any[]; einrichtungen: any[] }) {
  const cfg = SCOPE_CONFIG[scope];
  const [empfId, setEmpfId] = useState("");
  const [von, setVon] = useState(format(new Date(), "yyyy-MM-dd"));
  const [bis, setBis] = useState(format(addDays(new Date(), 14), "yyyy-MM-dd"));

  const create = useServerFn(createAnfrage);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => create({ data: {
      typ: cfg.typ,
      empfaenger_typ: cfg.empfaengerTyp,
      empfaenger_id: empfId,
      zeitraum_von: von,
      zeitraum_bis: bis,
    } }),
    onSuccess: () => { toast.success("Anfrage erstellt"); qc.invalidateQueries({ queryKey: ["anfragen"] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const options = scope === "mitarbeiter" ? mitarbeiter : einrichtungen;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{cfg.title} – neue Anfrage</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="space-y-1.5">
            <Label>{cfg.empfLabel}</Label>
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
