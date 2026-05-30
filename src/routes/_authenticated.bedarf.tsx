import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listEinrichtungen } from "@/lib/dispo.functions";
import {
  parseAnfrageText,
  getVerfuegbareMitarbeiter,
  createBedarfeBulk,
} from "@/lib/anfrage-ai.functions";
import { upsertEinsatz } from "@/lib/dispo.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Phone, MessageCircle, Check, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/bedarf")({
  component: BedarfPage,
});

type Bedarf = {
  datum: string;
  dienst: "F" | "S" | "N";
  qualifikation: "PFK" | "PHK";
  anzahl: number;
  notiz?: string;
};

function normalizePhone(p?: string | null) {
  if (!p) return "";
  return p.replace(/[^\d+]/g, "");
}

function BedarfPage() {
  const fetchEin = useServerFn(listEinrichtungen);
  const einQ = useQuery({ queryKey: ["einrichtungen"], queryFn: () => fetchEin() });

  const parseFn = useServerFn(parseAnfrageText);
  const bulkFn = useServerFn(createBedarfeBulk);

  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [einrichtungId, setEinrichtungId] = useState<string>("");
  const [bedarfe, setBedarfe] = useState<Bedarf[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const handleParse = async () => {
    if (text.trim().length < 5) return;
    setParsing(true);
    try {
      const res = await parseFn({ data: { text } });
      if (res.matched_einrichtung_id) setEinrichtungId(res.matched_einrichtung_id);
      setBedarfe(res.bedarfe as Bedarf[]);
      if (res.bedarfe.length === 0) {
        toast.warning("Keine Bedarfe erkannt — bitte manuell eintragen.");
      } else {
        toast.success(`${res.bedarfe.length} Bedarfe erkannt${res.einrichtung_name ? ` für ${res.einrichtung_name}` : ""}`);
        setSelectedIdx(0);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Parsen fehlgeschlagen");
    } finally {
      setParsing(false);
    }
  };

  const addRow = () => {
    const today = new Date().toISOString().slice(0, 10);
    setBedarfe([...bedarfe, { datum: today, dienst: "F", qualifikation: "PFK", anzahl: 1 }]);
    setSelectedIdx(bedarfe.length);
  };

  const updateRow = (i: number, patch: Partial<Bedarf>) => {
    setBedarfe(bedarfe.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  };

  const removeRow = (i: number) => {
    setBedarfe(bedarfe.filter((_, k) => k !== i));
    if (selectedIdx === i) setSelectedIdx(null);
  };

  const saveAll = async () => {
    if (!einrichtungId) { toast.error("Bitte Einrichtung auswählen"); return; }
    if (bedarfe.length === 0) { toast.error("Keine Bedarfe vorhanden"); return; }
    try {
      const r = await bulkFn({ data: { einrichtung_id: einrichtungId, bedarfe } });
      toast.success(`${r.count} Bedarfe in die Planungsmatrix übernommen`);
      setBedarfe([]);
      setText("");
      setSelectedIdx(null);
    } catch (e: any) {
      toast.error(e.message ?? "Speichern fehlgeschlagen");
    }
  };

  const selected = selectedIdx !== null ? bedarfe[selectedIdx] : null;

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" /> Bedarfsassistent
        </h1>
        <p className="text-sm text-muted-foreground">
          Anfrage einfügen oder Bedarfe manuell anlegen — passende Mitarbeiter werden direkt vorgeschlagen.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* LEFT: Eingabe + Bedarfsliste */}
        <div className="space-y-4">
          <Tabs defaultValue="ki">
            <TabsList>
              <TabsTrigger value="ki">KI-Auslesen</TabsTrigger>
              <TabsTrigger value="manuell">Manuell</TabsTrigger>
            </TabsList>
            <TabsContent value="ki" className="space-y-3">
              <Textarea
                placeholder="E-Mail-Text einfügen, z.B.:&#10;&#10;Hallo, wir brauchen für den 03.05 Frühdienst 1x PFK und am 04.05 Spätdienst 2x PHK in Haus Sonnenschein. Danke!"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
              <Button onClick={handleParse} disabled={parsing || text.trim().length < 5}>
                <Sparkles className="mr-2 h-4 w-4" />
                {parsing ? "Analysiere…" : "Mit KI auslesen"}
              </Button>
            </TabsContent>
            <TabsContent value="manuell">
              <p className="text-sm text-muted-foreground mb-2">Rechts Bedarfe per "+" hinzufügen.</p>
            </TabsContent>
          </Tabs>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Erkannte Bedarfe ({bedarfe.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={addRow}><Plus className="h-4 w-4 mr-1" />Zeile</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Einrichtung</Label>
                <Select value={einrichtungId} onValueChange={setEinrichtungId}>
                  <SelectTrigger><SelectValue placeholder="Einrichtung wählen…" /></SelectTrigger>
                  <SelectContent>
                    {(einQ.data ?? []).map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}{e.ort ? ` · ${e.ort}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {bedarfe.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-6">Noch keine Bedarfe</div>
              )}

              {bedarfe.map((b, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[1fr_70px_70px_60px_auto_auto] gap-2 items-center p-2 rounded border cursor-pointer ${selectedIdx === i ? "bg-accent border-primary" : ""}`}
                  onClick={() => setSelectedIdx(i)}
                >
                  <Input type="date" value={b.datum} onChange={(e) => updateRow(i, { datum: e.target.value })} className="h-8" />
                  <Select value={b.dienst} onValueChange={(v: any) => updateRow(i, { dienst: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="F">Früh</SelectItem>
                      <SelectItem value="S">Spät</SelectItem>
                      <SelectItem value="N">Nacht</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={b.qualifikation} onValueChange={(v: any) => updateRow(i, { qualifikation: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PFK">PFK</SelectItem>
                      <SelectItem value="PHK">PHK</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" min={1} max={20} value={b.anzahl} onChange={(e) => updateRow(i, { anzahl: parseInt(e.target.value) || 1 })} className="h-8" />
                  <Badge variant="secondary" className="text-xs">{b.dienst}</Badge>
                  <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Zeile entfernen" onClick={(e) => { e.stopPropagation(); removeRow(i); }}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}

              {bedarfe.length > 0 && (
                <Button onClick={saveAll} className="w-full">
                  <Check className="mr-2 h-4 w-4" />
                  In Planungsmatrix übernehmen
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Mitarbeitervorschläge für ausgewählten Bedarf */}
        <div>
          <VorschlagsPanel bedarf={selected} einrichtungId={einrichtungId} />
        </div>
      </div>
    </div>
  );
}

function VorschlagsPanel({ bedarf, einrichtungId }: { bedarf: Bedarf | null; einrichtungId: string }) {
  const fetchVor = useServerFn(getVerfuegbareMitarbeiter);
  const upsertFn = useServerFn(upsertEinsatz);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vorschlaege", bedarf?.datum, bedarf?.dienst, bedarf?.qualifikation, einrichtungId],
    queryFn: () => fetchVor({ data: {
      datum: bedarf!.datum,
      dienst: bedarf!.dienst,
      qualifikation: bedarf!.qualifikation,
      einrichtung_id: einrichtungId || undefined,
    } }),
    enabled: !!bedarf,
  });

  const zusage = async (mitId: string) => {
    if (!bedarf || !einrichtungId) { toast.error("Einrichtung erst auswählen"); return; }
    try {
      await upsertFn({ data: {
        mitarbeiter_id: mitId,
        einrichtung_id: einrichtungId,
        datum: bedarf.datum,
        dienst: bedarf.dienst,
        status: "BESTAETIGT",
      } });
      toast.success("Einsatz angelegt (Bestätigt)");
      refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Fehler");
    }
  };

  if (!bedarf) {
    return (
      <Card className="h-full">
        <CardContent className="py-16 text-center text-muted-foreground">
          <Users className="h-10 w-10 mx-auto mb-2 opacity-40" />
          Wähle links einen Bedarf, um verfügbare Mitarbeiter zu sehen.
        </CardContent>
      </Card>
    );
  }

  const hasGeo = data?.einrichtung_geocoded;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="h-4 w-4" />
          Verfügbare Mitarbeiter
          <Badge variant="outline" className="ml-auto">{bedarf.datum} · {bedarf.dienst} · {bedarf.qualifikation}</Badge>
        </CardTitle>
        {einrichtungId && !hasGeo && (
          <p className="text-xs text-muted-foreground">Einrichtung nicht geokodiert – Sortierung nach Nähe nicht verfügbar.</p>
        )}
        {hasGeo && (
          <p className="text-xs text-muted-foreground">Sortiert nach Entfernung zur Einrichtung (nächste zuerst).</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <div className="text-sm text-muted-foreground">Lade…</div>}
        {data && data.vorschlaege.length === 0 && (
          <div className="text-sm text-muted-foreground py-4 text-center">Keine passenden Mitarbeiter verfügbar.</div>
        )}
        {(data?.vorschlaege ?? []).map((m: any) => {
          const tel = normalizePhone(m.telefon);
          const wa = tel.replace(/^\+/, "");
          const radius = m.max_radius_km ?? m.umkreis_km;
          return (
            <div key={m.id} className="flex items-center gap-2 p-2 border rounded hover:bg-accent/40">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate flex items-center gap-2">
                  {m.nachname}, {m.vorname}
                  {m.distanz_km != null && (
                    <Badge variant={m.im_radius === false ? "outline" : "default"} className="text-[10px]">
                      {m.distanz_km} km{m.im_radius === false ? " · außerh. Radius" : ""}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  <Badge variant="secondary" className="mr-1">{m.qualifikation}</Badge>
                  <Badge variant="outline" className="mr-1">{m.anstellung}</Badge>
                  {radius != null && <span className="mr-1">Radius {radius} km · </span>}
                  {m.eingeplant}/{m.max_einsaetze ?? 20} Einsätze · noch {m.frei} frei
                </div>
              </div>
              {tel && (
                <>
                  <Button asChild size="icon" variant="outline" className="h-8 w-8" title={`Anrufen: ${m.telefon}`}>
                    <a href={`tel:${tel}`} aria-label={`Anrufen: ${m.telefon}`}><Phone className="h-3.5 w-3.5" /></a>
                  </Button>
                  <Button asChild size="icon" variant="outline" className="h-8 w-8" title={`WhatsApp: ${m.telefon}`}>
                    <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp: ${m.telefon}`}>
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                </>
              )}
              <Button size="sm" onClick={() => zusage(m.id)}>
                <Check className="h-3.5 w-3.5 mr-1" /> Zusage
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
