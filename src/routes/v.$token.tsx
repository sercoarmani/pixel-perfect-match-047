import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { addDays, format, parseISO, differenceInCalendarDays } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getAnfrageByToken, submitVerfuegbarkeit } from "@/lib/dispo.functions";

export const Route = createFileRoute("/v/$token")({
  component: VerfPage,
});

const DIENSTE = ["F", "S", "N"] as const;
type Dienst = (typeof DIENSTE)[number];

function VerfPage() {
  const { token } = Route.useParams();
  const fetchAnf = useServerFn(getAnfrageByToken);
  const submit = useServerFn(submitVerfuegbarkeit);

  const { data, isLoading } = useQuery({
    queryKey: ["v-token", token],
    queryFn: () => fetchAnf({ data: { token } }),
  });

  if (isLoading) return <Centered>Lade…</Centered>;
  if (!data) return <Centered title="Link ungültig">Der Link wurde nicht gefunden.</Centered>;
  if ("expired" in data) return <Centered title="Link abgelaufen">Bitte fordere einen neuen Link an.</Centered>;
  if (!data.anfrage) return <Centered title="Fehler">Anfrage nicht gefunden.</Centered>;
  if (data.anfrage.status === "beantwortet") {
    return <Centered title="Bereits eingereicht">Danke! Du hast deine Verfügbarkeit bereits gemeldet.</Centered>;
  }

  return <VerfForm token={token} data={data} onSubmit={submit} />;
}

function VerfForm({ token, data, onSubmit }: { token: string; data: any; onSubmit: any }) {
  const von = parseISO(data.anfrage.zeitraum_von);
  const bis = parseISO(data.anfrage.zeitraum_bis);
  const tage = useMemo(
    () => Array.from({ length: differenceInCalendarDays(bis, von) + 1 }, (_, i) => addDays(von, i)),
    [von, bis],
  );

  // marks[date][dienst] = boolean (available)
  const [marks, setMarks] = useState<Record<string, Set<Dienst>>>({});
  const [notiz, setNotiz] = useState("");

  const toggle = (date: string, d: Dienst) => {
    setMarks((m) => {
      const next = { ...m };
      const s = new Set(next[date] ?? []);
      if (s.has(d)) s.delete(d); else s.add(d);
      next[date] = s;
      return next;
    });
  };

  const setAllDay = (date: string, on: boolean) => {
    setMarks((m) => ({ ...m, [date]: on ? new Set(DIENSTE) : new Set() }));
  };

  const mut = useMutation({
    mutationFn: () => {
      const eintraege: { datum: string; dienst: Dienst; verfuegbar: boolean }[] = [];
      tage.forEach((d) => {
        const iso = format(d, "yyyy-MM-dd");
        DIENSTE.forEach((di) => {
          eintraege.push({ datum: iso, dienst: di, verfuegbar: marks[iso]?.has(di) ?? false });
        });
      });
      return onSubmit({ data: { token, eintraege, notiz: notiz || undefined } });
    },
    onSuccess: () => toast.success("Verfügbarkeit übermittelt – danke!"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Hallo {data.mitarbeiter?.vorname} 👋</CardTitle>
          <CardDescription>
            Bitte markiere, wann du im Zeitraum
            <strong className="mx-1">{format(von, "dd.MM.")} – {format(bis, "dd.MM.yyyy")}</strong>
            verfügbar bist. F = Früh, S = Spät, N = Nacht.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {tage.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const set = marks[iso] ?? new Set();
            const allOn = set.size === 3;
            return (
              <div key={iso} className="flex items-center justify-between gap-2 rounded-md border p-2">
                <div className="flex-1 text-sm">
                  <div className="font-medium">{format(d, "EEE dd.MM.", { locale: de })}</div>
                </div>
                <div className="flex gap-1">
                  {DIENSTE.map((di) => (
                    <button
                      key={di}
                      type="button"
                      onClick={() => toggle(iso, di)}
                      className={cn(
                        "h-9 w-10 rounded text-sm font-semibold transition-colors",
                        set.has(di)
                          ? "bg-status-bestaetigt text-status-bestaetigt-fg"
                          : "bg-muted text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {di}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setAllDay(iso, !allOn)}
                    className="ml-1 h-9 rounded px-2 text-xs text-muted-foreground hover:bg-accent"
                  >
                    {allOn ? "✗" : "alle"}
                  </button>
                </div>
              </div>
            );
          })}
          <div className="pt-2">
            <Textarea placeholder="Notiz (optional)" value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={2} />
          </div>
          <Button className="w-full" size="lg" onClick={() => mut.mutate()} disabled={mut.isPending}>
            Verfügbarkeit übermitteln
          </Button>
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
