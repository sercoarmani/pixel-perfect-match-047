import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listProtokoll, retryVersand } from "@/lib/versand-log.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ScrollText, RefreshCw, ArrowDownLeft, ArrowUpRight, Mail, MessageSquare,
  Phone, AlertCircle, CheckCircle2, RotateCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/protokoll")({
  component: ProtokollPage,
});

type Eintrag = {
  id: string;
  quelle: "versand" | "email_out" | "email_in";
  created_at: string;
  kanal: string;
  richtung: "out" | "in";
  status: string;
  empfaenger: string | null;
  absender: string | null;
  betreff: string | null;
  inhalt: string | null;
  mitarbeiter_id: string | null;
  einrichtung_id: string | null;
  fehler: string | null;
  metadata: any;
  mitarbeiter_name?: string | null;
  einrichtung_name?: string | null;
};

function statusBadge(status: string) {
  const s = status.toLowerCase();
  if (["sent", "delivered", "received", "assigned", "bedarf_created", "answered"].includes(s)) {
    return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/15">{status}</Badge>;
  }
  if (["failed", "dlq", "error"].includes(s)) {
    return <Badge variant="destructive">{status}</Badge>;
  }
  if (["queued", "pending", "neu"].includes(s)) {
    return <Badge variant="secondary">{status}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function kanalIcon(kanal: string) {
  switch (kanal) {
    case "email": return <Mail className="h-4 w-4" />;
    case "telegram": return <MessageSquare className="h-4 w-4" />;
    case "whatsapp": return <Phone className="h-4 w-4" />;
    default: return <ScrollText className="h-4 w-4" />;
  }
}

function ProtokollPage() {
  const fetchProtokoll = useServerFn(listProtokoll);
  const retryFn = useServerFn(retryVersand);
  const [kanal, setKanal] = useState<string>("all");
  const [richtung, setRichtung] = useState<"all" | "out" | "in">("all");
  const [status, setStatus] = useState<string>("all");
  const [suche, setSuche] = useState<string>("");
  const [selected, setSelected] = useState<Eintrag | null>(null);

  const queryKey = useMemo(
    () => ["protokoll", kanal, richtung, status, suche],
    [kanal, richtung, status, suche],
  );

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey,
    queryFn: () =>
      fetchProtokoll({
        data: {
          kanal: kanal === "all" ? undefined : kanal,
          richtung,
          status: status === "all" ? undefined : status,
          suche: suche || undefined,
          limit: 300,
        },
      }),
  });

  const retryMutation = useMutation({
    mutationFn: (rawId: string) => retryFn({ data: { id: rawId } }),
    onSuccess: (res: any) => {
      if (res?.ok) {
        toast.success("Erneuter Versand erfolgreich.");
      } else {
        toast.error(`Retry fehlgeschlagen: ${res?.fehler ?? "Unbekannt"}`);
      }
      refetch();
    },
    onError: (e: any) => toast.error(`Retry fehlgeschlagen: ${e?.message ?? "Unbekannt"}`),
  });

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> Versand-Protokoll
          </h1>
          <p className="text-sm text-muted-foreground">
            Komplette Historie aller ausgehenden und eingehenden Nachrichten.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Einträge" value={stats?.gesamt ?? 0} />
        <StatCard label="Ausgehend" value={stats?.out ?? 0} icon={<ArrowUpRight className="h-4 w-4 text-emerald-500" />} />
        <StatCard label="Eingehend" value={stats?.in ?? 0} icon={<ArrowDownLeft className="h-4 w-4 text-blue-500" />} />
        <StatCard label="Fehlgeschlagen" value={stats?.failed ?? 0} icon={<AlertCircle className="h-4 w-4 text-destructive" />} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select value={kanal} onValueChange={setKanal}>
            <SelectTrigger><SelectValue placeholder="Kanal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kanäle</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
              <SelectItem value="email">E-Mail</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="intern">Intern</SelectItem>
            </SelectContent>
          </Select>
          <Select value={richtung} onValueChange={(v) => setRichtung(v as any)}>
            <SelectTrigger><SelectValue placeholder="Richtung" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="out">Ausgehend</SelectItem>
              <SelectItem value="in">Eingehend</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="sent">sent</SelectItem>
              <SelectItem value="failed">failed</SelectItem>
              <SelectItem value="queued">queued</SelectItem>
              <SelectItem value="received">received</SelectItem>
              <SelectItem value="neu">neu</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Suche (Empfänger, Betreff, Inhalt)…"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Verlauf {data ? `(${data.eintraege.length})` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Lade…</div>
          ) : !data || data.eintraege.length === 0 ? (
            <div className="text-sm text-muted-foreground">Keine Einträge gefunden.</div>
          ) : (
            <div className="divide-y">
              {data.eintraege.map((e: any) => (
                <button
                  key={e.id}
                  onClick={() => setSelected(e)}
                  className="w-full py-3 flex gap-3 items-start text-left hover:bg-accent/40 rounded-md px-2 -mx-2 transition-colors"
                >
                  <div className="mt-1 text-muted-foreground">{kanalIcon(e.kanal)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {e.richtung === "out" ? "→" : "←"} {e.empfaenger ?? e.absender ?? "—"}
                      </span>
                      {statusBadge(e.status)}
                      <Badge variant="outline" className="text-xs uppercase">{e.kanal}</Badge>
                      {e.metadata?.provider_message_id != null && (
                        <Badge variant="outline" className="text-xs font-mono">
                          msg #{String(e.metadata.provider_message_id)}
                        </Badge>
                      )}
                      {e.metadata?.provider_status != null && (
                        <Badge variant="outline" className="text-xs font-mono">
                          HTTP {String(e.metadata.provider_status)}
                        </Badge>
                      )}
                      {e.mitarbeiter_name && (
                        <Badge variant="secondary" className="text-xs">
                          MA: {e.mitarbeiter_name}
                        </Badge>
                      )}
                      {e.einrichtung_name && (
                        <Badge variant="secondary" className="text-xs">
                          {e.einrichtung_name}
                        </Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("de-DE")}
                      </span>
                    </div>
                    {e.betreff && (
                      <div className="text-sm font-medium mt-1 truncate">{e.betreff}</div>
                    )}
                    {e.inhalt && (
                      <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
                        {e.inhalt}
                      </div>
                    )}
                    {e.fehler && (
                      <div className="text-sm text-destructive mt-1 flex items-start gap-1">
                        <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                        {e.fehler}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DetailDialog
        eintrag={selected}
        onClose={() => { setSelected(null); retryMutation.reset(); }}
        onRetry={(rawId) => retryMutation.mutate(rawId)}
        retrying={retryMutation.isPending}
        retryResult={retryMutation.data as RetryResult | undefined}
        retryError={retryMutation.error as Error | null}
      />
    </div>
  );
}

type RetryResult = {
  ok: boolean;
  status: "sent" | "failed";
  startedAt: string;
  finishedAt: string;
  provider_status: number | null;
  provider_message_id: number | null;
  provider_response: any;
  fehler: string | null;
};

function DetailDialog({
  eintrag, onClose, onRetry, retrying,
}: {
  eintrag: Eintrag | null;
  onClose: () => void;
  onRetry: (rawId: string) => void;
  retrying: boolean;
}) {
  const open = !!eintrag;
  const meta = eintrag?.metadata ?? {};
  const isVersand = eintrag?.id.startsWith("v:");
  const rawId = isVersand && eintrag ? eintrag.id.slice(2) : null;
  const canRetry =
    !!rawId &&
    eintrag?.richtung === "out" &&
    (eintrag?.status === "failed" || eintrag?.status === "dlq") &&
    !!meta?.retry?.kind;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {eintrag && kanalIcon(eintrag.kanal)}
            {eintrag?.betreff ?? "Versand-Detail"}
          </DialogTitle>
          <DialogDescription>
            {eintrag && new Date(eintrag.created_at).toLocaleString("de-DE")}
          </DialogDescription>
        </DialogHeader>

        {eintrag && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kanal" value={eintrag.kanal} />
              <Field label="Richtung" value={eintrag.richtung} />
              <Field label="Status" value={<span>{statusBadge(eintrag.status)}</span>} />
              <Field label="Quelle" value={eintrag.quelle} />
              <Field label="Empfänger" value={eintrag.empfaenger ?? "—"} />
              <Field label="Absender" value={eintrag.absender ?? "—"} />
              {eintrag.mitarbeiter_name && (
                <Field label="Mitarbeiter" value={eintrag.mitarbeiter_name} />
              )}
              {eintrag.einrichtung_name && (
                <Field label="Einrichtung" value={eintrag.einrichtung_name} />
              )}
            </div>

            <div className="rounded-md border p-3 bg-muted/40">
              <div className="text-xs uppercase text-muted-foreground mb-1">Inhalt</div>
              <div className="whitespace-pre-wrap text-sm">{eintrag.inhalt ?? "—"}</div>
            </div>

            <div className="rounded-md border p-3">
              <div className="text-xs uppercase text-muted-foreground mb-2">Provider-Response</div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <Field label="HTTP-Status" value={meta?.provider_status ?? "—"} />
                <Field label="Message-Id" value={meta?.provider_message_id ?? "—"} />
              </div>
              {meta?.provider_response && (
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-muted/60 p-2 text-xs">
                  {JSON.stringify(meta.provider_response, null, 2)}
                </pre>
              )}
            </div>

            {eintrag.fehler && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <div className="text-xs uppercase text-destructive mb-1 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" /> Fehlermeldung
                </div>
                <div className="text-sm text-destructive whitespace-pre-wrap">{eintrag.fehler}</div>
              </div>
            )}

            {meta && Object.keys(meta).length > 0 && (
              <details className="rounded-md border p-3">
                <summary className="text-xs uppercase text-muted-foreground cursor-pointer">
                  Komplette Metadaten
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto text-xs">
                  {JSON.stringify(meta, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {canRetry && rawId && (
            <Button
              variant="default"
              onClick={() => onRetry(rawId)}
              disabled={retrying}
            >
              <RotateCw className={`h-4 w-4 mr-2 ${retrying ? "animate-spin" : ""}`} />
              Erneut senden
            </Button>
          )}
          {!canRetry && eintrag?.richtung === "out" &&
            (eintrag?.status === "failed" || eintrag?.status === "dlq") && (
            <span className="text-xs text-muted-foreground self-center">
              Kein automatischer Retry möglich (kein gespeicherter Plan).
            </span>
          )}
          <Button variant="outline" onClick={onClose}>Schließen</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase text-muted-foreground">{label}</div>
          {icon ?? <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
        </div>
        <div className="text-2xl font-semibold mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}
