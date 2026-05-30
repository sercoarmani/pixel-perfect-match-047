import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listProtokoll } from "@/lib/versand-log.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollText, RefreshCw, ArrowDownLeft, ArrowUpRight, Mail, MessageSquare, Phone, AlertCircle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/protokoll")({
  component: ProtokollPage,
});

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
  const [kanal, setKanal] = useState<string>("all");
  const [richtung, setRichtung] = useState<"all" | "out" | "in">("all");
  const [status, setStatus] = useState<string>("all");
  const [suche, setSuche] = useState<string>("");

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
              {data.eintraege.map((e) => (
                <div key={e.id} className="py-3 flex gap-3 items-start">
                  <div className="mt-1 text-muted-foreground">{kanalIcon(e.kanal)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">
                        {e.richtung === "out" ? "→" : "←"} {e.empfaenger ?? e.absender ?? "—"}
                      </span>
                      {statusBadge(e.status)}
                      <Badge variant="outline" className="text-xs uppercase">{e.kanal}</Badge>
                      {(e as any).mitarbeiter_name && (
                        <Badge variant="secondary" className="text-xs">
                          MA: {(e as any).mitarbeiter_name}
                        </Badge>
                      )}
                      {(e as any).einrichtung_name && (
                        <Badge variant="secondary" className="text-xs">
                          {(e as any).einrichtung_name}
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
                      <div className="text-sm text-muted-foreground mt-0.5 line-clamp-3 whitespace-pre-wrap">
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
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
