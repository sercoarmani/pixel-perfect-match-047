import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { listVerbindungen, type VerbindungInfo } from "@/lib/verwaltung.functions";
import { listTemplates, updateTemplate } from "@/lib/dispo.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Settings2, RefreshCw, Plug, AlertTriangle, CheckCircle2, CircleSlash, FileText, Save } from "lucide-react";
import { GeocodeRunAllCard } from "@/components/geocode-run-all-card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/verwaltung")({
  component: VerwaltungPage,
});

function StatusBadge({ status }: { status: VerbindungInfo["status"] }) {
  if (status === "verbunden")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20">
        <CheckCircle2 className="mr-1 h-3 w-3" /> verbunden
      </Badge>
    );
  if (status === "fehler")
    return (
      <Badge variant="destructive">
        <AlertTriangle className="mr-1 h-3 w-3" /> Fehler
      </Badge>
    );
  if (status === "nicht_verbunden")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        <CircleSlash className="mr-1 h-3 w-3" /> nicht verbunden
      </Badge>
    );
  return <Badge variant="outline">unbekannt</Badge>;
}

function formatAktiv(d: string | null) {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
}

const KATEGORIE_LABEL: Record<VerbindungInfo["kategorie"], string> = {
  messaging: "Messaging",
  email: "E-Mail",
  telefonie: "Telefonie",
  api: "APIs & Dienste",
  sonstiges: "Sonstiges",
};

function VerwaltungPage() {
  const fetchVerb = useServerFn(listVerbindungen);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["verwaltung", "verbindungen"],
    queryFn: () => fetchVerb(),
  });

  const grouped = (data ?? []).reduce<Record<string, VerbindungInfo[]>>((acc, v) => {
    (acc[v.kategorie] ||= []).push(v);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Settings2 className="h-6 w-6" /> Verwaltung
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Übersicht aller Verbindungen und Dienste. Neue Integrationen können hier ergänzt werden.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Aktualisieren
        </Button>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Lade Verbindungen…</div>}

      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Werkzeuge
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <GeocodeRunAllCard />
        </div>
      </section>



      <section className="space-y-3">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" /> Nachrichtenvorlagen
        </h2>
        <NachrichtenTemplatesCard />
      </section>

      {Object.entries(grouped).map(([kat, items]) => (
        <section key={kat} className="space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {KATEGORIE_LABEL[kat as VerbindungInfo["kategorie"]] ?? kat}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {items.map((v) => (
              <Card key={v.key}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Plug className="h-4 w-4 text-muted-foreground" />
                      {v.name}
                    </CardTitle>
                    <StatusBadge status={v.status} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{v.beschreibung}</p>
                  {v.detail && <div className="text-xs font-mono text-foreground/80">{v.detail}</div>}
                  <div className="flex justify-between text-xs text-muted-foreground border-t pt-2">
                    <span>zuletzt aktiv: {formatAktiv(v.zuletzt_aktiv)}</span>
                    <span>verwaltet in: {v.verwaltet_in}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Card className="border-dashed">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Weitere Dienste lassen sich in <span className="font-mono">src/lib/verwaltung.functions.ts</span> ergänzen
          – Status, „zuletzt aktiv" und Beschreibung werden hier automatisch angezeigt.
        </CardContent>
      </Card>
    </div>
  );
}

function NachrichtenTemplatesCard() {
  const fetchTpl = useServerFn(listTemplates);
  const saveTpl = useServerFn(updateTemplate);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["templates"], queryFn: () => fetchTpl() });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      const m: Record<string, string> = {};
      for (const t of data) m[t.id] = t.text;
      setDrafts(m);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (vars: { id: string; text: string }) => saveTpl({ data: vars }),
    onSuccess: () => { toast.success("Vorlage gespeichert"); qc.invalidateQueries({ queryKey: ["templates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Lade Vorlagen…</CardContent></Card>;
  if (!data || data.length === 0) return (
    <Card><CardContent className="py-6 text-sm text-muted-foreground">Keine Vorlagen vorhanden.</CardContent></Card>
  );

  return (
    <div className="grid gap-3">
      {data.map((t: any) => (
        <Card key={t.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between gap-2">
              <span>{t.bezeichnung}</span>
              <Badge variant="outline" className="font-mono text-[10px]">{t.schluessel}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor={`tpl-${t.id}`} className="sr-only">Vorlagentext</Label>
            <Textarea
              id={`tpl-${t.id}`}
              value={drafts[t.id] ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [t.id]: e.target.value })}
              rows={5}
              className="font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() => save.mutate({ id: t.id, text: drafts[t.id] ?? "" })}
                disabled={save.isPending || (drafts[t.id] ?? "") === t.text}
              >
                <Save className="h-3.5 w-3.5 mr-1" /> Speichern
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
