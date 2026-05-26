import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboard } from "@/lib/dispo.functions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Building2, Inbox, CalendarDays, AlertCircle, ArrowRight } from "lucide-react";
import { format, addDays } from "date-fns";
import { de } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

const STATUS_LABEL: Record<string, string> = {
  GEPLANT: "Geplant",
  INTERN: "Intern",
  ZUR_UEBERPRUEFUNG: "Zur Prüfung",
  BESTAETIGT: "Bestätigt",
  ABGESAGT: "Abgesagt",
  AUSGEPLANT: "Ausgeplant",
};

const DIENST_LABEL: Record<string, string> = { F: "Früh", S: "Spät", N: "Nacht" };

function DashboardPage() {
  const fetchDash = useServerFn(getDashboard);
  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchDash(),
    refetchInterval: 60_000,
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Lade Dashboard…</div>;
  if (error) return <div className="p-6 text-destructive">Fehler: {(error as Error).message}</div>;
  if (!data) return null;

  const today = new Date();
  const nextDays = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Übersicht zum {format(today, "EEEE, d. MMMM yyyy", { locale: de })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi to="/mitarbeiter" icon={Users} label="Aktive Mitarbeiter" value={data.kpis.mitarbeiterAktiv} />
        <Kpi to="/einrichtungen" icon={Building2} label="Aktive Einrichtungen" value={data.kpis.einrichtungenAktiv} />
        <Kpi to="/anfragen" icon={Inbox} label="Offene Anfragen" value={data.kpis.anfragenOffen} highlight={data.kpis.anfragenOffen > 0} />
        <Kpi to="/plan" icon={CalendarDays} label="Einsätze diesen Monat" value={data.kpis.einsaetzeMonat} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Monatsübersicht</CardTitle>
          <CardDescription>Geplante, besetzte und mögliche Einsätze (analog Excel-Planungsliste)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <Metric
            label="Besetzungsquote"
            value={`${data.monatsStats.besetztPct}%`}
            sub={`${data.monatsStats.besetzt} von ${data.monatsStats.geplant} bestätigt/intern`}
            pct={data.monatsStats.besetztPct}
            color="emerald"
          />
          <Metric
            label="Auslastung"
            value={`${data.monatsStats.auslastungPct}%`}
            sub={`${data.monatsStats.geplant} geplant / ${data.monatsStats.moeglich} möglich`}
            pct={Math.min(100, data.monatsStats.auslastungPct)}
            color="primary"
          />
          <Metric
            label="Offen"
            value={String(data.monatsStats.offen)}
            sub="noch nicht besetzte Dienste"
            pct={data.monatsStats.geplant > 0 ? Math.round((data.monatsStats.offen / data.monatsStats.geplant) * 100) : 0}
            color="amber"
          />
        </CardContent>
        <CardContent className="border-t pt-4">
          <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Geplant je Qualifikation</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(data.qualGruppen)
              .sort((a, b) => (b[1] as any).geplant - (a[1] as any).geplant)
              .map(([qual, v]: any) => (
                <div key={qual} className="flex items-center justify-between rounded border px-3 py-1.5 text-sm">
                  <span className="font-medium">{qual}</span>
                  <span className="text-muted-foreground">
                    {v.geplant} Einsätze · {v.gesamt} MA
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Einsätze heute</CardTitle>
            <CardDescription>{data.einsaetzeHeute.length} geplant</CardDescription>
          </CardHeader>
          <CardContent>
            {data.einsaetzeHeute.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Einsätze für heute geplant.</p>
            ) : (
              <ul className="divide-y">
                {data.einsaetzeHeute.map((e: any) => (
                  <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="w-12 justify-center">{DIENST_LABEL[e.dienst] ?? e.dienst}</Badge>
                      <div>
                        <div className="font-medium">
                          {e.mitarbeiter ? `${e.mitarbeiter.vorname} ${e.mitarbeiter.nachname}` : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {e.einrichtung?.name ?? "—"} {e.einrichtung?.ort ? `· ${e.einrichtung.ort}` : ""}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={e.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status diesen Monat</CardTitle>
            <CardDescription>Einsätze nach Status</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(STATUS_LABEL).map((s) => {
              const count = data.statusZaehlung[s] ?? 0;
              const total = data.kpis.einsaetzeMonat || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={s} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nächste 7 Tage</CardTitle>
            <CardDescription>Einsätze pro Tag</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-32">
              {nextDays.map((d) => {
                const key = format(d, "yyyy-MM-dd");
                const count = data.wochenZaehlung[key] ?? 0;
                const max = Math.max(1, ...Object.values<number>(data.wochenZaehlung));
                const h = (count / max) * 100;
                return (
                  <div key={key} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs font-medium">{count}</div>
                    <div className="w-full bg-muted rounded-t flex-1 flex items-end">
                      <div className="w-full bg-primary rounded-t" style={{ height: `${h}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground">{format(d, "EE", { locale: de })}</div>
                    <div className="text-[10px] text-muted-foreground">{format(d, "d.M.")}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Abwesenheiten (7 Tage)
            </CardTitle>
            <CardDescription>{data.abwesenheitenWoche.length} Einträge</CardDescription>
          </CardHeader>
          <CardContent>
            {data.abwesenheitenWoche.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Abwesenheiten in den nächsten 7 Tagen.</p>
            ) : (
              <ul className="divide-y max-h-64 overflow-auto">
                {data.abwesenheitenWoche.map((a: any) => (
                  <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <div className="font-medium">
                        {a.mitarbeiter ? `${a.mitarbeiter.vorname} ${a.mitarbeiter.nachname}` : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(a.datum), "EE, d.M.", { locale: de })}
                      </div>
                    </div>
                    <Badge variant="outline">{a.art}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ to, icon: Icon, label, value, highlight }: { to: string; icon: any; label: string; value: number; highlight?: boolean }) {
  return (
    <Link to={to}>
      <Card className={"transition-shadow hover:shadow-md " + (highlight ? "border-amber-400" : "")}>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
              <div className="mt-1 text-3xl font-semibold">{value}</div>
            </div>
            <Icon className={"h-5 w-5 " + (highlight ? "text-amber-500" : "text-muted-foreground")} />
          </div>
          <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
            Öffnen <ArrowRight className="h-3 w-3" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: Record<string, "default" | "outline" | "secondary" | "destructive"> = {
    BESTAETIGT: "default",
    GEPLANT: "secondary",
    INTERN: "secondary",
    ZUR_UEBERPRUEFUNG: "outline",
    ABGESAGT: "destructive",
    AUSGEPLANT: "outline",
  };
  return <Badge variant={variant[status] ?? "outline"}>{STATUS_LABEL[status] ?? status}</Badge>;
}
