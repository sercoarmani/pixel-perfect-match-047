import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getStatistik } from "@/lib/dispo.functions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/statistik")({
  component: StatistikPage,
});

function StatistikPage() {
  const [jahr, setJahr] = useState(new Date().getFullYear());
  const fetchStat = useServerFn(getStatistik);
  const { data, isLoading } = useQuery({
    queryKey: ["statistik", jahr],
    queryFn: () => fetchStat({ data: { jahr } }),
  });

  const aktuellerMonat = new Date().getMonth();
  const cur = data?.monate[aktuellerMonat];
  const prev = aktuellerMonat > 0 ? data?.monate[aktuellerMonat - 1] : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Statistiken</h1>
          <p className="text-sm text-muted-foreground">Monatsvergleich · Jahresübersicht</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Vorheriges Jahr" onClick={() => setJahr(jahr - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <div className="px-3 py-1.5 rounded border bg-card font-semibold min-w-[80px] text-center">{jahr}</div>
          <Button variant="outline" size="icon" aria-label="Nächstes Jahr" onClick={() => setJahr(jahr + 1)} disabled={jahr >= new Date().getFullYear()}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      {isLoading && <div className="text-muted-foreground">Lade…</div>}
      {data && (
        <>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Snap label="Aktive Mitarbeiter" value={data.snapshot.mitarbeiterAktiv} />
            <Snap label="Aktive Einrichtungen" value={data.snapshot.einrichtungenAktiv} />
            <Snap label="Inaktive Einrichtungen" value={data.snapshot.einrichtungenInaktiv} muted />
            <Snap label={`Einsätze ${monthName(aktuellerMonat)}`} value={cur?.geplant ?? 0} compare={prev?.geplant ?? null} current={cur?.geplant ?? 0} />
            <Snap label="Besetzungsquote" value={`${cur?.besetztPct ?? 0}%`} compare={prev?.besetztPct ?? null} current={cur?.besetztPct ?? 0} suffix="%" />
            <Snap label="Auslastung" value={`${cur?.auslastungPct ?? 0}%`} compare={prev?.auslastungPct ?? null} current={cur?.auslastungPct ?? 0} suffix="%" />
            <Snap label="Offen" value={cur?.offen ?? 0} compare={prev?.offen ?? null} current={cur?.offen ?? 0} invertTrend />
            <Snap label="Urlaub" value={cur?.urlaub ?? 0} compare={prev?.urlaub ?? null} current={cur?.urlaub ?? 0} />
            <Snap label="Krankheit" value={cur?.krank ?? 0} compare={prev?.krank ?? null} current={cur?.krank ?? 0} invertTrend />
            <Snap label="Ø Reaktionszeit" value={cur?.reaktionAvgH != null ? `${cur.reaktionAvgH} h` : "—"} compare={prev?.reaktionAvgH ?? null} current={cur?.reaktionAvgH ?? 0} invertTrend />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Jahresübersicht {jahr}</CardTitle>
              <CardDescription>
                {data.gesamt.geplant} Einsätze · {data.gesamt.besetztPct}% besetzt · Auslastung {data.gesamt.auslastungPct}% · Ø Reaktion {data.gesamt.reaktionAvgH != null ? `${data.gesamt.reaktionAvgH} h` : "—"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="text-left py-2 pr-3">Monat</th>
                      <th className="text-right px-2">Geplant</th>
                      <th className="text-right px-2">Besetzt</th>
                      <th className="text-right px-2">Quote</th>
                      <th className="text-right px-2">Auslast.</th>
                      <th className="text-right px-2">Offen</th>
                      <th className="text-right px-2">Urlaub</th>
                      <th className="text-right px-2">Krank</th>
                      <th className="text-right pl-2">Ø Reakt.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monate.map((m, i) => {
                      const isCur = i === aktuellerMonat && jahr === new Date().getFullYear();
                      return (
                        <tr key={m.monat} className={"border-b last:border-0 " + (isCur ? "bg-accent/40 font-medium" : "")}>
                          <td className="py-2 pr-3">{m.label}</td>
                          <td className="text-right px-2 tabular-nums">{m.geplant}</td>
                          <td className="text-right px-2 tabular-nums">{m.besetzt}</td>
                          <td className="text-right px-2 tabular-nums">{m.besetztPct}%</td>
                          <td className="text-right px-2 tabular-nums">{m.auslastungPct}%</td>
                          <td className="text-right px-2 tabular-nums">{m.offen}</td>
                          <td className="text-right px-2 tabular-nums">{m.urlaub}</td>
                          <td className="text-right px-2 tabular-nums">{m.krank}</td>
                          <td className="text-right pl-2 tabular-nums">{m.reaktionAvgH != null ? `${m.reaktionAvgH} h` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2 pr-3">Gesamt</td>
                      <td className="text-right px-2 tabular-nums">{data.gesamt.geplant}</td>
                      <td className="text-right px-2 tabular-nums">{data.gesamt.besetzt}</td>
                      <td className="text-right px-2 tabular-nums">{data.gesamt.besetztPct}%</td>
                      <td className="text-right px-2 tabular-nums">{data.gesamt.auslastungPct}%</td>
                      <td className="text-right px-2 tabular-nums">{data.gesamt.offen}</td>
                      <td className="text-right px-2 tabular-nums">{data.gesamt.urlaub}</td>
                      <td className="text-right px-2 tabular-nums">{data.gesamt.krank}</td>
                      <td className="text-right pl-2 tabular-nums">{data.gesamt.reaktionAvgH != null ? `${data.gesamt.reaktionAvgH} h` : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Einsätze pro Monat</CardTitle>
              <CardDescription>Geplant vs. besetzt</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2 h-48">
                {data.monate.map((m, i) => {
                  const max = Math.max(1, ...data.monate.map((x) => x.geplant));
                  const hGes = (m.geplant / max) * 100;
                  const hBes = (m.besetzt / max) * 100;
                  return (
                    <div key={m.monat} className="flex-1 flex flex-col items-center gap-1">
                      <div className="text-[10px] font-medium tabular-nums">{m.geplant}</div>
                      <div className="w-full flex-1 flex items-end relative">
                        <div className="absolute bottom-0 w-full bg-muted rounded-t" style={{ height: `${hGes}%` }} />
                        <div className="absolute bottom-0 w-full bg-primary rounded-t" style={{ height: `${hBes}%` }} />
                      </div>
                      <div className={"text-[10px] " + (i === aktuellerMonat ? "font-semibold" : "text-muted-foreground")}>{m.label}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function monthName(i: number) {
  return new Date(2024, i, 1).toLocaleDateString("de-DE", { month: "long" });
}

function Snap({
  label, value, muted, compare, current, suffix, invertTrend,
}: {
  label: string;
  value: number | string;
  muted?: boolean;
  compare?: number | null;
  current?: number;
  suffix?: string;
  invertTrend?: boolean;
}) {
  let trend: "up" | "down" | "flat" | null = null;
  let diff: string | null = null;
  if (compare != null && current != null) {
    if (current > compare) trend = "up";
    else if (current < compare) trend = "down";
    else trend = "flat";
    const d = current - compare;
    diff = `${d > 0 ? "+" : ""}${Math.round(d * 10) / 10}${suffix ?? ""}`;
  }
  const good = invertTrend ? trend === "down" : trend === "up";
  const bad = invertTrend ? trend === "up" : trend === "down";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={"mt-1 text-2xl font-semibold " + (muted ? "text-muted-foreground" : "")}>{value}</div>
        {trend && (
          <div className={"mt-1 flex items-center gap-1 text-xs " + (good ? "text-emerald-600 dark:text-emerald-400" : bad ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
            {trend === "up" ? <TrendingUp className="h-3 w-3" /> : trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            <span>{diff} ggü. Vormonat</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
