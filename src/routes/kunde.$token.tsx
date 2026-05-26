import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPortalEinrichtung, createBedarfFromPortal } from "@/lib/portal.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/kunde/$token")({
  component: KundenPortal,
});

type Eintrag = {
  datum: string;
  dienst: "F" | "S" | "N";
  qualifikation: "PFK" | "PHK";
  anzahl: number;
  notiz: string;
};

const heute = () => new Date().toISOString().slice(0, 10);
const leer = (): Eintrag => ({ datum: heute(), dienst: "F", qualifikation: "PFK", anzahl: 1, notiz: "" });

function KundenPortal() {
  const { token } = Route.useParams();
  const fetchEin = useServerFn(getPortalEinrichtung);
  const send = useServerFn(createBedarfFromPortal);
  const { data: ein, isLoading, error } = useQuery({
    queryKey: ["portal", token],
    queryFn: () => fetchEin({ data: { token } }),
    retry: false,
  });
  const [eintraege, setEintraege] = useState<Eintrag[]>([leer()]);
  const [done, setDone] = useState<number | null>(null);

  const m = useMutation({
    mutationFn: () => send({ data: { token, eintraege: eintraege.map(e => ({ ...e, notiz: e.notiz || null })) } }),
    onSuccess: (r) => { setDone(r.count); setEintraege([leer()]); toast.success(`${r.count} Bedarf(e) übermittelt`); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Lade…</div>;
  if (error) return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-semibold mb-2">Link ungültig</h1>
      <p className="text-sm text-muted-foreground">Dieser Bedarfslink ist nicht gültig oder wurde deaktiviert. Bitte kontaktieren Sie Ihren Ansprechpartner.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-6">
        <header className="text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Bedarfsmeldung</p>
          <h1 className="text-2xl font-semibold mt-1">{ein!.name}</h1>
          {(ein!.ort || ein!.wohnbereich) && (
            <p className="text-sm text-muted-foreground">{[ein!.wohnbereich, ein!.ort].filter(Boolean).join(" · ")}</p>
          )}
        </header>

        {done !== null && (
          <Card className="border-green-500/40 bg-green-500/5">
            <CardContent className="flex items-center gap-3 pt-6">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div className="text-sm">
                <p className="font-medium">{done} Bedarf(e) übermittelt</p>
                <p className="text-muted-foreground">Wir melden uns mit einem Vorschlag bei Ihnen.</p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Welche Dienste benötigen Sie?</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {eintraege.map((e, i) => (
              <div key={i} className="rounded-lg border bg-card p-3 space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label className="text-xs">Datum</Label>
                    <Input type="date" value={e.datum} onChange={(ev) => upd(i, { datum: ev.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Schicht</Label>
                    <Select value={e.dienst} onValueChange={(v) => upd(i, { dienst: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="F">Früh (F)</SelectItem>
                        <SelectItem value="S">Spät (S)</SelectItem>
                        <SelectItem value="N">Nacht (N)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Qualifikation</Label>
                    <Select value={e.qualifikation} onValueChange={(v) => upd(i, { qualifikation: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PFK">PFK</SelectItem>
                        <SelectItem value="PHK">PHK</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Anzahl</Label>
                    <Input type="number" min={1} max={20} value={e.anzahl} onChange={(ev) => upd(i, { anzahl: Math.max(1, Number(ev.target.value) || 1) })} />
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs">Notiz (optional)</Label>
                    <Textarea rows={2} value={e.notiz} onChange={(ev) => upd(i, { notiz: ev.target.value })} placeholder="z. B. Wohnbereich, besondere Anforderungen…" />
                  </div>
                  {eintraege.length > 1 && (
                    <Button variant="ghost" size="icon" onClick={() => setEintraege(eintraege.filter((_, x) => x !== i))} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setEintraege([...eintraege, leer()])}>
              <Plus className="mr-1 h-4 w-4" /> Weiterer Dienst
            </Button>
          </CardContent>
        </Card>

        <Button className="w-full" size="lg" onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? "Wird gesendet…" : `${eintraege.length} Bedarf(e) übermitteln`}
        </Button>

        <p className="text-center text-xs text-muted-foreground">DispoPlan · Bedarfsportal</p>
      </div>
    </div>
  );

  function upd(i: number, patch: Partial<Eintrag>) {
    setEintraege(eintraege.map((e, x) => x === i ? { ...e, ...patch } : e));
  }
}
