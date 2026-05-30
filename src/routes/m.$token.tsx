import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Trash2, CalendarPlus, CheckCircle2 } from "lucide-react";
import {
  getMitarbeiterPortal,
  submitMeineVerfuegbarkeit,
  deleteMeineVerfuegbarkeit,
} from "@/lib/mitarbeiter-portal.functions";

export const Route = createFileRoute("/m/$token")({
  component: PortalPage,
});

const DIENSTE = ["F", "S", "N"] as const;
type Dienst = (typeof DIENSTE)[number];
const DIENST_LABEL: Record<Dienst, string> = { F: "Früh", S: "Spät", N: "Nacht" };
// Schichtfarben (Früh = morgens/amber, Spät = blau, Nacht = indigo)
const DIENST_BTN: Record<Dienst, string> = {
  F: "bg-amber-500 text-white border-amber-500",
  S: "bg-sky-600 text-white border-sky-600",
  N: "bg-indigo-700 text-white border-indigo-700",
};
const DIENST_CHIP: Record<Dienst, string> = {
  F: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  S: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  N: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200",
};

const TAGE_VORAUS = 28;

function PortalPage() {
  const { token } = Route.useParams();
  const fetchPortal = useServerFn(getMitarbeiterPortal);
  const { data, isLoading } = useQuery({
    queryKey: ["portal", token],
    queryFn: () => fetchPortal({ data: { token } }),
  });

  if (isLoading) return <Centered>Lade…</Centered>;
  if (!data) return <Centered title="Link ungültig">Dieser persönliche Link ist nicht gültig. Bitte wende dich an die Disposition.</Centered>;

  return <Portal token={token} data={data} />;
}

function Portal({ token, data }: { token: string; data: any }) {
  const qc = useQueryClient();
  const submit = useServerFn(submitMeineVerfuegbarkeit);
  const del = useServerFn(deleteMeineVerfuegbarkeit);

  const tage = useMemo(
    () => Array.from({ length: TAGE_VORAUS }, (_, i) => addDays(new Date(), i)),
    [],
  );

  // additive Auswahl: marks[iso] = Set<Dienst>
  const [marks, setMarks] = useState<Record<string, Set<Dienst>>>({});
  const toggle = (iso: string, d: Dienst) =>
    setMarks((m) => {
      const next = { ...m };
      const s = new Set(next[iso] ?? []);
      s.has(d) ? s.delete(d) : s.add(d);
      next[iso] = s;
      return next;
    });
  const anyMarks = Object.values(marks).some((s) => s.size > 0);

  // bereits gemeldete Verfügbarkeiten als Schlüssel `${iso}|${dienst}` → status
  const vorhanden = useMemo(() => {
    const map = new Map<string, string>();
    (data.verfuegbarkeiten ?? []).forEach((v: any) => {
      if (v.verfuegbar) map.set(`${v.datum}|${v.dienst}`, v.status);
    });
    return map;
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => {
      const eintraege: { datum: string; dienst: Dienst }[] = [];
      Object.entries(marks).forEach(([iso, set]) =>
        set.forEach((d) => eintraege.push({ datum: iso, dienst: d })),
      );
      return submit({ data: { token, eintraege } });
    },
    onSuccess: (r: any) => {
      toast.success(r.anzahl > 0 ? `${r.anzahl} Schicht(en) gemeldet – danke!` : "Nichts Neues zu melden.");
      setMarks({});
      qc.invalidateQueries({ queryKey: ["portal", token] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (v: { datum: string; dienst: Dienst }) => del({ data: { token, ...v } }),
    onSuccess: () => { toast.success("Verfügbarkeit zurückgenommen"); qc.invalidateQueries({ queryKey: ["portal", token] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const gemeldet = (data.verfuegbarkeiten ?? []).filter((v: any) => v.verfuegbar);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Hallo {data.mitarbeiter.vorname} 👋</h1>
        <p className="text-sm text-muted-foreground">
          Trag hier ein, wann du in den nächsten {TAGE_VORAUS} Tagen einsatzbereit bist. F = Früh, S = Spät, N = Nacht.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarPlus className="h-4 w-4" /> Verfügbarkeit hinzufügen
          </CardTitle>
          <CardDescription>Tippe die Schichten an, die du übernehmen kannst.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tage.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const set = marks[iso] ?? new Set<Dienst>();
            const wknd = [0, 6].includes(d.getDay());
            return (
              <div
                key={iso}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md border p-2",
                  wknd && "bg-muted/40",
                )}
              >
                <div className="text-sm font-medium">{format(d, "EEE dd.MM.", { locale: de })}</div>
                <div className="flex gap-1.5">
                  {DIENSTE.map((di) => {
                    const status = vorhanden.get(`${iso}|${di}`);
                    const active = set.has(di);
                    if (status === "vergeben") {
                      return (
                        <span key={di} className={cn("flex h-10 w-12 items-center justify-center rounded text-sm font-semibold opacity-60", DIENST_CHIP[di])} title="bereits eingeteilt">
                          {di}✓
                        </span>
                      );
                    }
                    return (
                      <button
                        key={di}
                        type="button"
                        onClick={() => toggle(iso, di)}
                        className={cn(
                          "h-10 w-12 rounded border text-sm font-semibold transition-colors",
                          active ? DIENST_BTN[di] : "bg-muted text-muted-foreground hover:bg-accent",
                          status === "frei" && !active && "ring-1 ring-inset ring-emerald-400",
                        )}
                        title={status === "frei" ? "schon gemeldet" : DIENST_LABEL[di]}
                      >
                        {di}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <Button className="w-full" size="lg" disabled={!anyMarks || saveMut.isPending} onClick={() => saveMut.mutate()}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {saveMut.isPending ? "Speichere…" : "Verfügbarkeit speichern"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Deine gemeldeten Tage ({gemeldet.length})</CardTitle>
          <CardDescription>„vergeben" = bereits für einen Einsatz eingeteilt.</CardDescription>
        </CardHeader>
        <CardContent>
          {gemeldet.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Noch nichts gemeldet.</p>
          ) : (
            <div className="space-y-1.5">
              {gemeldet.map((v: any) => (
                <div key={v.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <span className="w-28 tabular-nums">{format(new Date(v.datum), "EEE dd.MM.", { locale: de })}</span>
                  <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", DIENST_CHIP[v.dienst as Dienst])}>
                    {DIENST_LABEL[v.dienst as Dienst]}
                  </span>
                  {v.status === "vergeben" ? (
                    <Badge variant="secondary" className="ml-auto">eingeteilt</Badge>
                  ) : (
                    <Button
                      size="sm" variant="ghost"
                      className="ml-auto text-destructive"
                      disabled={delMut.isPending}
                      onClick={() => delMut.mutate({ datum: v.datum, dienst: v.dienst })}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" /> Zurücknehmen
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Centered({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>{title && <CardTitle>{title}</CardTitle>}</CardHeader>
        <CardContent className="text-sm text-muted-foreground">{children}</CardContent>
      </Card>
    </div>
  );
}
