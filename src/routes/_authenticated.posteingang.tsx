import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listInbox,
  getInboxMail,
  assignInbox,
  setInboxStatus,
  reklassifyInbox,
  deleteInbox,
  bedarfAusInboxAnlegen,
  listEinrichtungenLite,
  listMitarbeiterLite,
} from "@/lib/email-inbox.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Inbox, RefreshCw, Sparkles, Trash2, CheckCircle2, Archive, Mail, Paperclip, Reply } from "lucide-react";
import { toast } from "sonner";
import { ComposeEmailDialog } from "@/components/compose-email-dialog";

export const Route = createFileRoute("/_authenticated/posteingang")({
  component: PosteingangPage,
});

type Status = "neu" | "zugeordnet" | "bedarf_angelegt" | "beantwortet" | "archiviert" | "fehler";

const STATUS_LABEL: Record<Status, string> = {
  neu: "Neu",
  zugeordnet: "Zugeordnet",
  bedarf_angelegt: "Bedarf angelegt",
  beantwortet: "Beantwortet",
  archiviert: "Archiviert",
  fehler: "Fehler",
};

function StatusBadge({ s }: { s: Status }) {
  const variant: Record<Status, string> = {
    neu: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    zugeordnet: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    bedarf_angelegt: "bg-violet-500/15 text-violet-600 border-violet-500/30",
    beantwortet: "bg-slate-500/15 text-slate-600 border-slate-500/30",
    archiviert: "bg-muted text-muted-foreground border-muted",
    fehler: "bg-destructive/15 text-destructive border-destructive/30",
  };
  return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${variant[s]}`}>{STATUS_LABEL[s]}</span>;
}

function PosteingangPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInbox);
  const [filter, setFilter] = useState<Status | "alle">("alle");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["email-inbox", filter],
    queryFn: () => listFn({ data: { status: filter === "alle" ? null : filter, limit: 200 } as never }),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Inbox className="h-6 w-6" />Posteingang</h1>
          <p className="text-sm text-muted-foreground">Eingehende E-Mails werden automatisch klassifiziert und Kunden/Mitarbeitern zugeordnet.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={(v) => setFilter(v as never)}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle</SelectItem>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Aktualisieren</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">{rows.length} E-Mails</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Lade…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Keine E-Mails. Sobald der Inbound-Webhook eingehende Nachrichten empfängt, erscheinen sie hier.</div>
          ) : (
            <div className="divide-y">
              {rows.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className="w-full text-left p-3 hover:bg-accent/40 transition-colors flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusBadge s={r.status} />
                    {r.ai_kategorie && <Badge variant="secondary" className="text-[10px]">{r.ai_kategorie}</Badge>}
                    <span className="text-sm font-medium truncate">{r.betreff || "(ohne Betreff)"}</span>
                    {(r.anhaenge?.length ?? 0) > 0 && (
                      <span className="text-xs text-muted-foreground inline-flex items-center"><Paperclip className="h-3 w-3 mr-1" />{r.anhaenge.length}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(r.empfangen_am).toLocaleString("de-DE")}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    Von {r.von_name ? `${r.von_name} ` : ""}&lt;{r.von_email}&gt;
                    {r.einrichtung && <span className="ml-2">· Kunde: <b>{r.einrichtung.name}</b></span>}
                    {r.mitarbeiter && <span className="ml-2">· MA: <b>{r.mitarbeiter.vorname} {r.mitarbeiter.nachname}</b></span>}
                  </div>
                  {r.ai_zusammenfassung && <div className="text-xs text-muted-foreground line-clamp-2">{r.ai_zusammenfassung}</div>}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DetailDialog id={selectedId} onClose={() => { setSelectedId(null); qc.invalidateQueries({ queryKey: ["email-inbox"] }); }} />
    </div>
  );
}

function DetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getInboxMail);
  const assignFn = useServerFn(assignInbox);
  const statusFn = useServerFn(setInboxStatus);
  const reklassifyFn = useServerFn(reklassifyInbox);
  const deleteFn = useServerFn(deleteInbox);
  const createBedarfFn = useServerFn(bedarfAusInboxAnlegen);
  const listEinFn = useServerFn(listEinrichtungenLite);
  const listMaFn = useServerFn(listMitarbeiterLite);

  const { data: mail, isLoading } = useQuery({
    queryKey: ["email-inbox", id],
    queryFn: () => getFn({ data: { id: id! } }),
    enabled: !!id,
  });

  const { data: einrichtungen = [] } = useQuery({
    queryKey: ["einrichtungen-lite"],
    queryFn: () => listEinFn(),
    enabled: !!id,
  });
  const { data: mitarbeiter = [] } = useQuery({
    queryKey: ["mitarbeiter-lite"],
    queryFn: () => listMaFn(),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["email-inbox"] });
  };

  const assign = useMutation({
    mutationFn: (p: { einrichtung_id?: string | null; mitarbeiter_id?: string | null }) =>
      assignFn({ data: { id: id!, ...p } as never }),
    onSuccess: () => { toast.success("Zuordnung gespeichert"); invalidate(); },
    onError: (e: any) => toast.error(e?.message ?? "Fehler"),
  });

  const setStatus = useMutation({
    mutationFn: (s: Status) => statusFn({ data: { id: id!, status: s } as never }),
    onSuccess: () => { toast.success("Status aktualisiert"); invalidate(); },
  });

  const reklassify = useMutation({
    mutationFn: () => reklassifyFn({ data: { id: id! } }),
    onSuccess: () => { toast.success("Neu klassifiziert"); invalidate(); },
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id: id! } }),
    onSuccess: () => { toast.success("Gelöscht"); invalidate(); onClose(); },
  });

  const ai = (mail as any)?.ai_extrakt as
    | { bedarf?: { datum?: string | null; schicht?: "F" | "S" | "N" | null; qualifikation?: string | null; anzahl?: number | null } | null }
    | undefined;

  const [replyOpen, setReplyOpen] = useState(false);

  const [bedarfDatum, setBedarfDatum] = useState<string>("");
  const [bedarfDienst, setBedarfDienst] = useState<"F" | "S" | "N">("F");
  const [bedarfQual, setBedarfQual] = useState<"PFK" | "PHK">("PFK");
  const [bedarfAnzahl, setBedarfAnzahl] = useState<number>(1);

  // Vorbelegung sobald Detail geladen ist
  useMemo(() => {
    if (mail && ai?.bedarf) {
      if (ai.bedarf.datum) setBedarfDatum(ai.bedarf.datum);
      if (ai.bedarf.schicht && ["F", "S", "N"].includes(ai.bedarf.schicht)) setBedarfDienst(ai.bedarf.schicht as never);
      if (ai.bedarf.qualifikation && ["PFK", "PHK"].includes(ai.bedarf.qualifikation)) setBedarfQual(ai.bedarf.qualifikation as never);
      if (ai.bedarf.anzahl && ai.bedarf.anzahl > 0) setBedarfAnzahl(ai.bedarf.anzahl);
    }
  }, [mail?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const createBedarf = useMutation({
    mutationFn: () =>
      createBedarfFn({
        data: {
          id: id!,
          einrichtung_id: (mail as any)?.zugeordnet_einrichtung_id,
          datum: bedarfDatum,
          dienst: bedarfDienst,
          qualifikation: bedarfQual,
          anzahl: bedarfAnzahl,
          notiz: (mail as any)?.ai_zusammenfassung ?? null,
        } as never,
      }),
    onSuccess: () => { toast.success("Bedarf angelegt"); invalidate(); onClose(); },
    onError: (e: any) => toast.error(e?.message ?? "Fehler"),
  });

  return (
    <Dialog open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />{(mail as any)?.betreff || "E-Mail"}</DialogTitle>
        </DialogHeader>
        {isLoading || !mail ? (
          <div className="text-sm text-muted-foreground">Lade…</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <StatusBadge s={(mail as any).status} />
              {(mail as any).ai_kategorie && <Badge variant="secondary">{(mail as any).ai_kategorie}</Badge>}
              {((mail as any).tags ?? []).map((t: string) => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border p-3 bg-muted/30">
              <div><div className="text-[11px] uppercase text-muted-foreground">Absender</div><div>{(mail as any).von_name} &lt;{(mail as any).von_email}&gt;</div></div>
              <div><div className="text-[11px] uppercase text-muted-foreground">Empfangen</div><div>{new Date((mail as any).empfangen_am).toLocaleString("de-DE")}</div></div>
              <div><div className="text-[11px] uppercase text-muted-foreground">An</div><div>{(mail as any).an_email ?? "–"}</div></div>
              <div><div className="text-[11px] uppercase text-muted-foreground">Auto-Quelle</div><div>{(mail as any).zuordnung_quelle ?? "–"} {(mail as any).zuordnung_confidence ? `· ${Math.round((mail as any).zuordnung_confidence * 100)}%` : ""}</div></div>
            </div>

            {(mail as any).ai_zusammenfassung && (
              <div className="rounded-md border p-3 bg-card">
                <div className="text-[11px] uppercase text-muted-foreground mb-1 flex items-center gap-1"><Sparkles className="h-3 w-3" />KI-Zusammenfassung</div>
                <div>{(mail as any).ai_zusammenfassung}</div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Kunde / Einrichtung</label>
                <Select
                  value={(mail as any).zugeordnet_einrichtung_id ?? "none"}
                  onValueChange={(v) => assign.mutate({ einrichtung_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="– wählen –" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">– keine Zuordnung –</SelectItem>
                    {einrichtungen.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}{e.ort ? `, ${e.ort}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Mitarbeiter</label>
                <Select
                  value={(mail as any).zugeordnet_mitarbeiter_id ?? "none"}
                  onValueChange={(v) => assign.mutate({ mitarbeiter_id: v === "none" ? null : v })}
                >
                  <SelectTrigger><SelectValue placeholder="– wählen –" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">– keine Zuordnung –</SelectItem>
                    {mitarbeiter.map((m: any) => (
                      <SelectItem key={m.id} value={m.id}>{m.nachname}, {m.vorname} ({m.kuerzel})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1">Inhalt</div>
              <pre className="whitespace-pre-wrap text-xs bg-muted/40 rounded p-3 max-h-72 overflow-y-auto">{(mail as any).body_text ?? "(kein Text)"}</pre>
            </div>

            {((mail as any).anhaenge ?? []).length > 0 && (
              <div>
                <div className="text-[11px] uppercase text-muted-foreground mb-1">Anhänge</div>
                <ul className="text-xs space-y-1">
                  {((mail as any).anhaenge as any[]).map((a, i) => (
                    <li key={i} className="flex items-center gap-2"><Paperclip className="h-3 w-3" />{a.filename} {a.size ? `· ${Math.round(a.size / 1024)} KB` : ""}</li>
                  ))}
                </ul>
              </div>
            )}

            {(mail as any).ai_kategorie === "bedarf" && (mail as any).zugeordnet_einrichtung_id && (
              <div className="rounded-md border p-3 space-y-2 bg-violet-500/5">
                <div className="text-[11px] uppercase text-muted-foreground">Bedarf anlegen</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <Input type="date" value={bedarfDatum} onChange={(e) => setBedarfDatum(e.target.value)} />
                  <Select value={bedarfDienst} onValueChange={(v) => setBedarfDienst(v as never)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="F">F – Früh</SelectItem>
                      <SelectItem value="S">S – Spät</SelectItem>
                      <SelectItem value="N">N – Nacht</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={bedarfQual} onValueChange={(v) => setBedarfQual(v as never)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PFK">PFK</SelectItem>
                      <SelectItem value="PHK">PHK</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" min={1} max={20} value={bedarfAnzahl} onChange={(e) => setBedarfAnzahl(parseInt(e.target.value) || 1)} />
                </div>
                <Button size="sm" disabled={!bedarfDatum || createBedarf.isPending} onClick={() => createBedarf.mutate()}>
                  <CheckCircle2 className="h-4 w-4 mr-1" />Bedarf anlegen
                </Button>
              </div>
            )}

            <div>
              <div className="text-[11px] uppercase text-muted-foreground mb-1">Notiz</div>
              <Textarea
                defaultValue={(mail as any).notiz ?? ""}
                onBlur={(e) => statusFn({ data: { id: id!, status: (mail as any).status, notiz: e.target.value } as never })}
                placeholder="Interne Notiz…"
              />
            </div>
          </div>
        )}
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="default" size="sm" onClick={() => setReplyOpen(true)} disabled={!mail}>
            <Reply className="h-4 w-4 mr-1" />Antworten
          </Button>
          <Button variant="outline" size="sm" onClick={() => reklassify.mutate()} disabled={reklassify.isPending}>
            <Sparkles className="h-4 w-4 mr-1" />KI erneut
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStatus.mutate("beantwortet")}>
            <CheckCircle2 className="h-4 w-4 mr-1" />Beantwortet
          </Button>
          <Button variant="outline" size="sm" onClick={() => setStatus.mutate("archiviert")}>
            <Archive className="h-4 w-4 mr-1" />Archivieren
          </Button>
          <Button variant="destructive" size="sm" onClick={() => del.mutate()} disabled={del.isPending}>
            <Trash2 className="h-4 w-4 mr-1" />Löschen
          </Button>
        </DialogFooter>
      </DialogContent>
      <ComposeEmailDialog
        open={replyOpen}
        onOpenChange={setReplyOpen}
        defaultTo={(mail as any)?.von_email ?? ""}
        defaultSubject={(mail as any)?.betreff ? `Re: ${(mail as any).betreff}` : "Re: "}
        defaultBody={`\n\n\n---\nUrsprüngliche Nachricht von ${(mail as any)?.von_name ?? (mail as any)?.von_email ?? ""}:\n${((mail as any)?.body_text ?? "").split("\n").map((l: string) => `> ${l}`).join("\n")}`}
        refs={{
          einrichtung_id: (mail as any)?.zugeordnet_einrichtung_id ?? null,
          mitarbeiter_id: (mail as any)?.zugeordnet_mitarbeiter_id ?? null,
          referenz_typ: "email_inbox_reply",
        }}
        inboxId={id}
        title="Antwort senden"
        onSent={invalidate}
      />
    </Dialog>
  );
}
