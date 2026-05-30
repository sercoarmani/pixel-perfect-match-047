import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMitarbeiter, upsertMitarbeiter, deleteMitarbeiter, getMitarbeiterDienstplan, getMitarbeiterDetail } from "@/lib/dispo.functions";
import { regenerateZugangsToken } from "@/lib/mitarbeiter-portal.functions";
import { getTelegramBotInfo, sendPersonalLink, sendVerfuegbarkeitsBroadcast } from "@/lib/telegram.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Phone, FileText, FileSpreadsheet, Trash2, Link2, Copy, RefreshCw, Send, CheckCircle2 } from "lucide-react";
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
        <div className="flex items-center gap-2">
          <VerfuegbarkeitsBroadcastButton mitarbeiter={data ?? []} />
          <Button onClick={() => setEdit({})}><Plus className="mr-1 h-4 w-4" /> Neu</Button>
        </div>
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

function VerfuegbarkeitsBroadcastButton({ mitarbeiter }: { mitarbeiter: any[] }) {
  const [open, setOpen] = useState(false);
  const [monat, setMonat] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [nurAktive, setNurAktive] = useState(true);
  const send = useServerFn(sendVerfuegbarkeitsBroadcast);

  const monatsOptionen = useMemo(() => {
    const base = new Date();
    base.setDate(1);
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
      return { value, label };
    });
  }, []);

  const empfaengerAnzahl = (mitarbeiter ?? []).filter(
    (m) => m.telegram_chat_id != null && (!nurAktive || m.aktiv),
  ).length;

  const m = useMutation({
    mutationFn: () => send({ data: { monat, nur_aktive: nurAktive } }),
    onSuccess: (r: any) => {
      const fehler = (r.fehler ?? []).length;
      toast.success(
        `${r.gesendet} von ${r.gesamt} Nachrichten gesendet${fehler ? `, ${fehler} Fehler` : ""}.`,
      );
      if (fehler) console.warn("Telegram-Broadcast Fehler:", r.fehler);
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Send className="mr-1 h-4 w-4" /> Verfügbarkeitslink senden
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Verfügbarkeitslink per Telegram senden</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2 text-sm">
            <div className="space-y-1.5">
              <Label>Monat</Label>
              <Select value={monat} onValueChange={setMonat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monatsOptionen.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="capitalize">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 rounded border bg-card px-3 py-2">
              <input
                id="brd-aktiv"
                type="checkbox"
                checked={nurAktive}
                onChange={(e) => setNurAktive(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="brd-aktiv" className="cursor-pointer">Nur aktive Mitarbeiter</label>
            </div>
            <p className="text-xs text-muted-foreground">
              Es wird an <strong>{empfaengerAnzahl}</strong> verknüpfte Mitarbeiter gesendet. Jeder erhält seinen persönlichen Link für den gewählten Monat.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending || empfaengerAnzahl === 0}>
              {m.isPending ? "Sende…" : "Jetzt senden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    dienste_moeglich: (row.dienste_moeglich ?? ["F", "S", "N"]) as ("F" | "S" | "N")[],
    max_einsaetze: row.max_einsaetze ?? 20,
    umkreis_km: row.umkreis_km ?? null,
    status: row.status ?? "aktiv",
    plz: row.plz ?? "",
    fuehrerschein: row.fuehrerschein ?? false,
    profil_text: row.profil_text ?? "",
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
      <Field label="PLZ"><Input value={form.plz} onChange={(e) => setForm({ ...form, plz: e.target.value })} /></Field>
      <Field label="Führerschein">
        <div className="flex items-center gap-3 rounded border bg-card px-3 py-2 h-10">
          <input id="ma-fs-tog" type="checkbox" checked={form.fuehrerschein} onChange={(e) => setForm({ ...form, fuehrerschein: e.target.checked })} className="h-4 w-4" />
          <label htmlFor="ma-fs-tog" className="text-sm cursor-pointer">{form.fuehrerschein ? "vorhanden" : "kein Führerschein"}</label>
        </div>
      </Field>
      <Field label="Umkreis (km)">
        <Input
          type="number" min={0} inputMode="numeric"
          value={form.umkreis_km ?? ""}
          placeholder="z. B. 25"
          onChange={(e) => setForm({ ...form, umkreis_km: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </Field>
      <Field label="Max. Einsätze / Monat">
        <Input
          type="number" min={0} max={62} inputMode="numeric"
          value={form.max_einsaetze}
          onChange={(e) => setForm({ ...form, max_einsaetze: Number(e.target.value) || 0 })}
        />
      </Field>
      <Field label="MA-Status">
        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["aktiv", "schwanger", "austritt", "gesperrt", "inaktiv"] as const).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="space-y-1.5 col-span-2">
        <Label>Mögliche Dienste</Label>
        <div className="flex gap-2">
          {(["F", "S", "N"] as const).map((d) => {
            const active = form.dienste_moeglich.includes(d);
            const label = d === "F" ? "Früh" : d === "S" ? "Spät" : "Nacht";
            return (
              <button
                key={d}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    dienste_moeglich: active
                      ? form.dienste_moeglich.filter((x: string) => x !== d)
                      : [...form.dienste_moeglich, d],
                  })
                }
                className={
                  "flex-1 rounded-md border px-3 py-2 text-sm transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground hover:bg-muted")
                }
              >
                {d} · {label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Steuert, für welche Dienste der/die MA in der Anruf- und Vorschlagsliste erscheint.
        </p>
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label>Status</Label>
        <div className="flex items-center gap-3 rounded border bg-card px-3 py-2">
          <input id="ma-aktiv-tog" type="checkbox" checked={form.aktiv} onChange={(e) => setForm({...form, aktiv: e.target.checked})} className="h-4 w-4" />
          <label htmlFor="ma-aktiv-tog" className="text-sm cursor-pointer">{form.aktiv ? "Aktiv – wird in Planung & Listen angezeigt" : "Inaktiv – ausgeblendet"}</label>
        </div>
      </div>
      <div className="space-y-1.5 col-span-2">
        <Label>Profiltext / Notiz</Label>
        <Textarea rows={2} value={form.profil_text} onChange={(e) => setForm({ ...form, profil_text: e.target.value })} placeholder="Kurzprofil, Besonderheiten, Einsatzwünsche …" />
      </div>
    </div>
  );
}

function PersonalLink({ mitarbeiterId, token }: { mitarbeiterId: string; token?: string }) {
  const qc = useQueryClient();
  const regen = useServerFn(regenerateZugangsToken);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = token ? `${origin}/m/${token}` : "";

  const regenMut = useMutation({
    mutationFn: () => regen({ data: { mitarbeiter_id: mitarbeiterId } }),
    onSuccess: () => { toast.success("Neuer Link erzeugt – der alte ist jetzt ungültig."); qc.invalidateQueries({ queryKey: ["mitarbeiter-detail", mitarbeiterId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success("Link kopiert"); }
    catch { toast.error("Konnte nicht kopieren"); }
  };

  return (
    <section className="rounded-md border bg-muted/30 p-3">
      <h3 className="mb-2 flex items-center gap-2 font-medium"><Link2 className="h-4 w-4" /> Persönlicher Link</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Diesen Link an den/die Mitarbeiter:in senden. Damit kann er/sie ohne Login die eigene Verfügbarkeit eintragen – ohne Zugriff auf andere Daten.
      </p>
      <div className="flex items-center gap-2">
        <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button type="button" size="sm" variant="outline" onClick={copy} disabled={!url}><Copy className="mr-1 h-3.5 w-3.5" /> Kopieren</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => regenMut.mutate()} disabled={regenMut.isPending} title="Neuen Link erzeugen (alten ungültig machen)">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  );
}

function TelegramLink({ mitarbeiterId, token, chatId, username }: { mitarbeiterId: string; token?: string; chatId?: number | null; username?: string | null }) {
  const fetchBot = useServerFn(getTelegramBotInfo);
  const sendLink = useServerFn(sendPersonalLink);
  const { data: bot } = useQuery({ queryKey: ["tg-bot-info"], queryFn: () => fetchBot(), staleTime: 5 * 60_000 });
  const botUser = bot?.username ?? null;
  const deepLink = botUser && token ? `https://t.me/${botUser}?start=${token}` : "";
  const verknuepft = !!chatId;

  const copy = async () => {
    if (!deepLink) return;
    try { await navigator.clipboard.writeText(deepLink); toast.success("Bot-Link kopiert"); }
    catch { toast.error("Konnte nicht kopieren"); }
  };

  const sendMut = useMutation({
    mutationFn: () => sendLink({ data: { mitarbeiter_id: mitarbeiterId } }),
    onSuccess: () => toast.success("Persönlicher Link via Telegram gesendet"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-md border bg-muted/30 p-3">
      <h3 className="mb-2 flex items-center gap-2 font-medium">
        <Send className="h-4 w-4" /> Telegram-Bot
        {verknuepft ? (
          <Badge variant="default" className="ml-1"><CheckCircle2 className="mr-1 h-3 w-3" />verknüpft{username ? ` · @${username}` : ""}</Badge>
        ) : (
          <Badge variant="outline" className="ml-1">noch nicht verknüpft</Badge>
        )}
      </h3>
      {!bot ? (
        <p className="text-xs text-muted-foreground">Lade Bot-Info …</p>
      ) : !botUser ? (
        <p className="text-xs text-destructive">Bot ist nicht erreichbar. Bitte Telegram-Connector prüfen.</p>
      ) : verknuepft ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground flex-1">
            Mitarbeiter:in empfängt Anfragen direkt im Chat und kann mit Zusage/Absage antworten.
          </p>
          <Button type="button" size="sm" onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
            <Send className="mr-1 h-3.5 w-3.5" /> Verfügbarkeits-Link senden
          </Button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            Diesen Link an die Person senden. Mit einem Klick startet sie den Bot und ist verknüpft.
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly value={deepLink} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button type="button" size="sm" variant="outline" onClick={copy}><Copy className="mr-1 h-3.5 w-3.5" />Kopieren</Button>
            <Button type="button" size="sm" asChild>
              <a href={deepLink} target="_blank" rel="noreferrer"><Send className="mr-1 h-3.5 w-3.5" />Öffnen</a>
            </Button>
          </div>
        </>
      )}
    </section>
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
  const token = (data?.mitarbeiter as any)?.zugangs_token as string | undefined;
  const chatId = (data?.mitarbeiter as any)?.telegram_chat_id as number | null | undefined;
  const tgUser = (data?.mitarbeiter as any)?.telegram_username as string | null | undefined;
  return (
    <div className="space-y-4 pt-3 text-sm">
      <PersonalLink mitarbeiterId={mitarbeiterId} token={token} />
      <TelegramLink mitarbeiterId={mitarbeiterId} token={token} chatId={chatId} username={tgUser} />
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
