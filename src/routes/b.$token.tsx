import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { addDays, format, parseISO, differenceInCalendarDays } from "date-fns";
import { de } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { getAnfrageByToken, submitBedarf } from "@/lib/dispo.functions";

export const Route = createFileRoute("/b/$token")({
  component: BedarfPage,
});

const DIENSTE = ["F", "S", "N"] as const;
type Dienst = (typeof DIENSTE)[number];
type Row = { datum: string; dienst: Dienst; anzahl: number; qualifikation: "PFK" | "PHK" };

function BedarfPage() {
  const { token } = Route.useParams();
  const fetchAnf = useServerFn(getAnfrageByToken);
  const submit = useServerFn(submitBedarf);

  const { data, isLoading } = useQuery({
    queryKey: ["b-token", token],
    queryFn: () => fetchAnf({ data: { token } }),
  });

  if (isLoading) return <Centered>Lade…</Centered>;
  if (!data) return <Centered title="Link ungültig">Der Link wurde nicht gefunden.</Centered>;
  if ("expired" in data) return <Centered title="Link abgelaufen">Bitte fordere einen neuen Link an.</Centered>;
  if (!data.anfrage) return <Centered title="Fehler">Anfrage nicht gefunden.</Centered>;
  if (data.anfrage.status === "beantwortet") {
    return <Centered title="Bereits eingereicht">Danke – euer Bedarf ist eingegangen.</Centered>;
  }

  return <BedarfForm token={token} data={data} onSubmit={submit} />;
}

function BedarfForm({ token, data, onSubmit }: { token: string; data: any; onSubmit: any }) {
  const von = parseISO(data.anfrage.zeitraum_von);
  const bis = parseISO(data.anfrage.zeitraum_bis);
  const tage = useMemo(
    () => Array.from({ length: differenceInCalendarDays(bis, von) + 1 }, (_, i) => addDays(von, i)),
    [von, bis],
  );

  const [rows, setRows] = useState<Row[]>([]);
  const [notiz, setNotiz] = useState("");

  const addRow = (datum: string) => {
    setRows((r) => [...r, { datum, dienst: "F", anzahl: 1, qualifikation: "PFK" }]);
  };
  const upd = (i: number, patch: Partial<Row>) => {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const del = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));

  const mut = useMutation({
    mutationFn: () => onSubmit({ data: { token, eintraege: rows, notiz: notiz || undefined } }),
    onSuccess: () => toast.success("Bedarf übermittelt – danke!"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>{data.einrichtung?.name}</CardTitle>
          <CardDescription>
            Bitte trag den Personalbedarf für
            <strong className="mx-1">{format(von, "dd.MM.")} – {format(bis, "dd.MM.yyyy")}</strong>
            ein.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {tage.map((d) => {
            const iso = format(d, "yyyy-MM-dd");
            const dayRows = rows.map((r, i) => ({ r, i })).filter((x) => x.r.datum === iso);
            return (
              <div key={iso} className="rounded-md border p-2">
                <div className="mb-2 flex items-center justify-between">
                  <div className="font-medium text-sm">{format(d, "EEE dd.MM.", { locale: de })}</div>
                  <Button size="sm" variant="outline" onClick={() => addRow(iso)}>+ Bedarf</Button>
                </div>
                {dayRows.map(({ r, i }) => (
                  <div key={i} className="mb-1 flex items-center gap-2 text-sm">
                    <Select value={r.dienst} onValueChange={(v) => upd(i, { dienst: v as Dienst })}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DIENSTE.map((di) => <SelectItem key={di} value={di}>{di}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={r.qualifikation} onValueChange={(v) => upd(i, { qualifikation: v as any })}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PFK">PFK</SelectItem>
                        <SelectItem value="PHK">PHK</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min={1} max={20} value={r.anzahl}
                      onChange={(e) => upd(i, { anzahl: Math.max(1, Number(e.target.value)) })}
                      className="w-20" />
                    <Button size="sm" variant="ghost" onClick={() => del(i)}>×</Button>
                  </div>
                ))}
              </div>
            );
          })}
          <Textarea placeholder="Notiz (optional)" value={notiz} onChange={(e) => setNotiz(e.target.value)} rows={2} />
          <Button className="w-full" size="lg" onClick={() => mut.mutate()} disabled={mut.isPending || rows.length === 0}>
            Bedarf übermitteln
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
