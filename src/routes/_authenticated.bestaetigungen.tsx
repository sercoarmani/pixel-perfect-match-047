import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  listKundenbestaetigungen,
  getKundenbestaetigung,
  updateKundenbestaetigung,
  versendeKundenbestaetigung,
  verwerfeKundenbestaetigung,
} from "@/lib/kunden-bestaetigung.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Trash2, FileText, AlertCircle, CheckCircle2, Clock, Building2, User, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bestaetigungen")({
  component: BestaetigungenPage,
  errorComponent: ({ error }) => (
    <div className="p-6 text-sm text-destructive">Fehler beim Laden: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-6 text-sm">Seite nicht gefunden.</div>,
});

type StatusFilter = "entwurf" | "gesendet" | "fehler" | "alle";

function statusBadge(status: string) {
  if (status === "entwurf") return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Entwurf</Badge>;
  if (status === "gesendet") return <Badge className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-3 w-3 mr-1" />Gesendet</Badge>;
  return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Fehler</Badge>;
}

function maStatusLabel(s: string) {
  if (s === "sent") return { text: "MA-Unterlagen via Telegram gesendet", tone: "text-emerald-600", Icon: CheckCircle2 };
  if (s === "skipped") return { text: "Telegram übersprungen", tone: "text-muted-foreground", Icon: MessageCircle };
  if (s === "failed") return { text: "Telegram-Versand an MA fehlgeschlagen", tone: "text-destructive", Icon: AlertCircle };
  return { text: "Telegram-Versand ausstehend", tone: "text-muted-foreground", Icon: Clock };
}

function BestaetigungenPage() {
  const [filter, setFilter] = useState<StatusFilter>("entwurf");
  const [openId, setOpenId] = useState<string | null>(null);
  const list = useServerFn(listKundenbestaetigungen);
  const query = useQuery({
    queryKey: ["kunden-bestaetigungen", filter],
    queryFn: () => list({ data: { status: filter, limit: 100 } }),
    refetchInterval: 15000,
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kundenbestätigungen</h1>
          <p className="text-sm text-muted-foreground">Nach Mitarbeiter-Zusage erzeugte Entwürfe – prüfen, anpassen und an den Kunden senden.</p>
        </div>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="entwurf">Entwürfe</TabsTrigger>
            <TabsTrigger value="gesendet">Gesendet</TabsTrigger>
            <TabsTrigger value="fehler">Fehler</TabsTrigger>
            <TabsTrigger value="alle">Alle</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lade…</div>
      ) : query.error ? (
        <div className="text-sm text-destructive">Fehler: {(query.error as Error).message}</div>
      ) : (query.data ?? []).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Keine Einträge in dieser Ansicht.
        </Card>
      ) : (
        <div className="space-y-2">
          {(query.data ?? []).map((b: any) => {
            const maName = b.mitarbeiter ? `${b.mitarbeiter.vorname} ${b.mitarbeiter.nachname}` : "—";
            const einName = b.einrichtung?.name ?? "—";
            const maStat = maStatusLabel(b.ma_unterlagen_status);
            return (
              <Card
                key={b.id}
                className="p-3 md:p-4 flex flex-wrap items-center gap-3 cursor-pointer hover:bg-accent/40 transition-colors"
                onClick={() => setOpenId(b.id)}
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {statusBadge(b.status)}
                    <span className="font-medium truncate">{b.betreff || "(kein Betreff)"}</span>
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{einName}</span>
                    <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />{maName}</span>
                    <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" />{(b.dokument_ids ?? []).length} Dok.</span>
                    <span>{b.empfaenger_email ?? <em className="text-destructive">keine E-Mail</em>}</span>
                  </div>
                  {b.status === "gesendet" && (
                    <div className={`text-xs inline-flex items-center gap-1 ${maStat.tone}`}>
                      <maStat.Icon className="h-3 w-3" />{maStat.text}
                      {b.ma_unterlagen_fehler && <span className="text-destructive">· {b.ma_unterlagen_fehler}</span>}
                    </div>
                  )}
                  {b.fehler && <div className="text-xs text-destructive">{b.fehler}</div>}
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(b.created_at).toLocaleString("de-DE")}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {openId && <DetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(getKundenbestaetigung);
  const update = useServerFn(updateKundenbestaetigung);
  const send = useServerFn(versendeKundenbestaetigung);
  const discard = useServerFn(verwerfeKundenbestaetigung);

  const detail = useQuery({
    queryKey: ["kunden-bestaetigung", id],
    queryFn: () => get({ data: { id } }),
  });

  const [betreff, setBetreff] = useState("");
  const [body, setBody] = useState("");
  const [empfaengerEmail, setEmpfaengerEmail] = useState("");
  const [empfaengerName, setEmpfaengerName] = useState("");
  const [dokSel, setDokSel] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!detail.data || hydrated) return;
    const b = detail.data.bestaetigung;
    setBetreff(b.betreff ?? "");
    setBody(b.body_text ?? "");
    setEmpfaengerEmail(b.empfaenger_email ?? "");
    setEmpfaengerName(b.empfaenger_name ?? "");
    setDokSel(new Set(b.dokument_ids ?? []));
    setHydrated(true);
  }, [detail.data, hydrated]);

  const isReadOnly = detail.data?.bestaetigung?.status === "gesendet";

  const saveMut = useMutation({
    mutationFn: () => update({ data: {
      id,
      betreff,
      body_text: body,
      empfaenger_email: empfaengerEmail || null,
      empfaenger_name: empfaengerName || null,
      dokument_ids: Array.from(dokSel),
    } }),
    onSuccess: () => {
      toast.success("Änderungen gespeichert");
      qc.invalidateQueries({ queryKey: ["kunden-bestaetigung", id] });
      qc.invalidateQueries({ queryKey: ["kunden-bestaetigungen"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Speichern fehlgeschlagen"),
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      await update({ data: {
        id, betreff, body_text: body,
        empfaenger_email: empfaengerEmail || null,
        empfaenger_name: empfaengerName || null,
        dokument_ids: Array.from(dokSel),
      } });
      return send({ data: { id } });
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Kundenmail eingereiht. MA-Unterlagen: " + r.ma_unterlagen_status);
      } else {
        toast.error("Versand fehlgeschlagen: " + (r.fehler ?? "unbekannt"));
      }
      qc.invalidateQueries({ queryKey: ["kunden-bestaetigung", id] });
      qc.invalidateQueries({ queryKey: ["kunden-bestaetigungen"] });
      if (r.ok) onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Versand fehlgeschlagen"),
  });

  const discardMut = useMutation({
    mutationFn: () => discard({ data: { id } }),
    onSuccess: () => {
      toast.success("Entwurf verworfen");
      qc.invalidateQueries({ queryKey: ["kunden-bestaetigungen"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Löschen fehlgeschlagen"),
  });

  const previewHtml = useMemo(() => {
    return body.split(/\n\n+/).map((p, i) => (
      <p key={i} className="mb-3 leading-relaxed whitespace-pre-wrap">{p}</p>
    ));
  }, [body]);

  const docs = detail.data?.verfuegbare_dokumente ?? [];
  const einsatz = detail.data?.einsatz;
  const ma = detail.data?.mitarbeiter;
  const ein = detail.data?.einrichtung;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Kundenbestätigung {isReadOnly ? "(gesendet)" : "vorbereiten"}</DialogTitle>
          <DialogDescription>
            {ein?.name ?? "—"}
            {ma && <> · {ma.vorname} {ma.nachname}{ma.qualifikation ? ` (${ma.qualifikation})` : ""}</>}
            {einsatz && <> · {new Date(einsatz.datum).toLocaleDateString("de-DE")} {einsatz.dienst}</>}
          </DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />Lade…
          </div>
        ) : (
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="grid md:grid-cols-2 gap-4 pb-4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Empfänger-Name</Label>
                    <Input value={empfaengerName} onChange={(e) => setEmpfaengerName(e.target.value)} disabled={isReadOnly} />
                  </div>
                  <div>
                    <Label className="text-xs">Empfänger-E-Mail</Label>
                    <Input type="email" value={empfaengerEmail} onChange={(e) => setEmpfaengerEmail(e.target.value)} disabled={isReadOnly} />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Betreff</Label>
                  <Input value={betreff} onChange={(e) => setBetreff(e.target.value)} disabled={isReadOnly} />
                </div>
                <div>
                  <Label className="text-xs">Text</Label>
                  <Textarea rows={12} value={body} onChange={(e) => setBody(e.target.value)} disabled={isReadOnly} className="font-mono text-xs" />
                </div>

                <div>
                  <Label className="text-xs flex items-center justify-between">
                    <span>Anhänge (Download-Links, 30 Tage gültig)</span>
                    <span className="text-muted-foreground">{dokSel.size} / {docs.length} ausgewählt</span>
                  </Label>
                  {docs.length === 0 ? (
                    <p className="text-xs text-muted-foreground mt-1">Keine freigegebenen Dokumente für diesen Mitarbeiter.</p>
                  ) : (
                    <div className="border rounded-md divide-y mt-1">
                      {docs.map((d: any) => (
                        <label key={d.id} className="flex items-center gap-2 p-2 text-xs cursor-pointer hover:bg-accent/40">
                          <Checkbox
                            checked={dokSel.has(d.id)}
                            onCheckedChange={(c) => {
                              setDokSel((prev) => {
                                const n = new Set(prev);
                                if (c) n.add(d.id); else n.delete(d.id);
                                return n;
                              });
                            }}
                            disabled={isReadOnly}
                          />
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate flex-1">{d.dateiname}</span>
                          <span className="text-muted-foreground shrink-0">{d.typ}</span>
                          {d.groesse_bytes && <span className="text-muted-foreground shrink-0">{Math.round(d.groesse_bytes / 1024)} KB</span>}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Vorschau</Label>
                <div className="border rounded-md p-4 bg-card text-sm">
                  <div className="text-xs text-muted-foreground border-b pb-2 mb-3 space-y-1">
                    <div><span className="font-medium">An:</span> {empfaengerName ? `${empfaengerName} <${empfaengerEmail}>` : empfaengerEmail || <span className="text-destructive">—</span>}</div>
                    <div><span className="font-medium">Betreff:</span> {betreff || <span className="text-muted-foreground italic">(leer)</span>}</div>
                  </div>
                  <div>{previewHtml}</div>
                  {dokSel.size > 0 && (
                    <div className="mt-4 space-y-2 border-t pt-3">
                      {docs.filter((d: any) => dokSel.has(d.id)).map((d: any) => (
                        <div key={d.id} className="inline-block mr-2 mb-1 px-3 py-1.5 bg-foreground text-background rounded text-xs">
                          ⬇︎ {d.dateiname}
                        </div>
                      ))}
                      <p className="text-xs text-muted-foreground">Links sind 30 Tage gültig.</p>
                    </div>
                  )}
                </div>

                {detail.data?.bestaetigung?.status === "gesendet" && (
                  <div className="border rounded-md p-3 bg-emerald-50 dark:bg-emerald-950/30 text-xs space-y-1">
                    <div className="font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Gesendet am {detail.data.bestaetigung.gesendet_am && new Date(detail.data.bestaetigung.gesendet_am).toLocaleString("de-DE")}
                    </div>
                    {(() => {
                      const s = maStatusLabel(detail.data!.bestaetigung.ma_unterlagen_status);
                      return (
                        <div className={`flex items-center gap-1 ${s.tone}`}>
                          <s.Icon className="h-3 w-3" /> {s.text}
                        </div>
                      );
                    })()}
                    {detail.data.bestaetigung.ma_unterlagen_fehler && (
                      <div className="text-destructive">{detail.data.bestaetigung.ma_unterlagen_fehler}</div>
                    )}
                  </div>
                )}
                {detail.data?.bestaetigung?.fehler && (
                  <div className="border border-destructive/50 rounded-md p-3 bg-destructive/10 text-xs text-destructive">
                    {detail.data.bestaetigung.fehler}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="gap-2">
          {!isReadOnly && (
            <Button variant="outline" size="sm" onClick={() => discardMut.mutate()} disabled={discardMut.isPending}>
              <Trash2 className="h-4 w-4 mr-1" />Verwerfen
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={onClose}>Schließen</Button>
          {!isReadOnly && (
            <>
              <Button variant="outline" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Speichern
              </Button>
              <Button
                onClick={() => sendMut.mutate()}
                disabled={sendMut.isPending || !empfaengerEmail}
              >
                {sendMut.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
                An Kunde senden
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
