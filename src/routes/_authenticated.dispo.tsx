import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Phone, PhoneCall, Check, X, Megaphone, Copy, Send, Compass } from "lucide-react";
import { toast } from "sonner";
import { getDispoOffeneBedarfe, bedarfZusage, bedarfAbsage } from "@/lib/dispo.functions";
import { sendBedarfBroadcast } from "@/lib/telegram.functions";
import { formatKm } from "@/lib/format-distance";

const DIENST_LANG: Record<string, string> = { F: "Früh", S: "Spät", N: "Nacht" };

export const Route = createFileRoute("/_authenticated/dispo")({
  component: DispoPage,
});

function DispoPage() {
  const fetchOffene = useServerFn(getDispoOffeneBedarfe);
  const qc = useQueryClient();
  // `faktor` = sofortiger Anzeigewert (Slider), `debouncedFaktor` = effektiver Wert für die Query.
  const [faktor, setFaktor] = useState(0.8);
  const [debouncedFaktor, setDebouncedFaktor] = useState(0.8);
  // `scopeKey` = stabile Signatur des aktuellen Anfragen-Sets.
  // Wechselt das Set (z. B. nach Zusage / neuer Anfrage), fallen alle Faktor-Caches der alten Disposition weg.
  const [scopeKey, setScopeKey] = useState<string>("init");

  useEffect(() => {
    if (faktor === debouncedFaktor) return;
    // Cache-Hit innerhalb derselben Anfragen-Disposition? Sofort übernehmen.
    const cached = qc.getQueryData(["dispo-offene", scopeKey, faktor]);
    if (cached) {
      setDebouncedFaktor(faktor);
      return;
    }
    const t = setTimeout(() => setDebouncedFaktor(faktor), 200);
    return () => clearTimeout(t);
  }, [faktor, debouncedFaktor, qc, scopeKey]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["dispo-offene", scopeKey, debouncedFaktor],
    queryFn: () => fetchOffene({ data: { radius_faktor: debouncedFaktor } }),
    placeholderData: (prev) => prev,
    // Kurzes Client-Caching pro (Anfragen-Set, Faktorwert): 2 min frisch, 10 min im Speicher.
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  // Sobald Daten da sind: tatsächlichen Scope (sortierte IDs) berechnen und ggf. übernehmen.
  // Erstes Ergebnis wird in den richtigen Cache-Slot kopiert, damit es wiederverwendbar bleibt.
  useEffect(() => {
    if (!data) return;
    const ids = ((data as any).bedarfe ?? []).map((b: any) => b.id).sort().join("|");
    const newScope = ids || "leer";
    if (newScope !== scopeKey) {
      qc.setQueryData(["dispo-offene", newScope, debouncedFaktor], data);
      setScopeKey(newScope);
    }
  }, [data, scopeKey, debouncedFaktor, qc]);

  const bedarfe = (data as any)?.bedarfe ?? [];
  const trefferGesamt = bedarfe.reduce((s: number, b: any) => s + (b.anrufliste?.length ?? 0), 0);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <PhoneCall className="h-5 w-5" /> Disposition
        </h1>
        <p className="text-sm text-muted-foreground">
          {bedarfe.length} offene Kundenanfrage{bedarfe.length === 1 ? "" : "n"} – passende Mitarbeiter mit „Zusage"/„Absage" besetzen.
        </p>
      </div>

      <div className="rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Compass className="h-4 w-4" /> Radius-Faktor
          </div>
          <div className="flex items-center gap-3 flex-1 min-w-[260px] max-w-md">
            <Slider
              min={0.3}
              max={2}
              step={0.05}
              value={[faktor]}
              onValueChange={(v) => setFaktor(Number(v[0].toFixed(2)))}
            />
            <div className="font-mono tabular-nums text-sm w-12 text-right">
              {faktor.toFixed(2)}
            </div>
          </div>
          <div className="flex gap-1">
            {[0.6, 0.8, 1.0, 1.2].map((p) => (
              <Button
                key={p}
                size="sm"
                variant={Math.abs(faktor - p) < 0.001 ? "default" : "outline"}
                onClick={() => setFaktor(p)}
              >
                {p.toFixed(1)}
              </Button>
            ))}
          </div>
          <div className="text-sm text-muted-foreground ml-auto">
            <span className="font-semibold text-foreground tabular-nums">{trefferGesamt}</span>{" "}
            passende Mitarbeiter · effektiver Radius =&nbsp;
            <span className="font-mono">max_radius_km × {faktor.toFixed(2)}</span>
            {isFetching && <span className="ml-2 italic">aktualisiere…</span>}
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
      {!isLoading && bedarfe.length === 0 && (
        <div className="rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
          Keine offenen Kundenanfragen. 🎉
        </div>
      )}

      <div className="space-y-4">
        {bedarfe.map((b: any) => (
          <BedarfCard key={b.id} bedarf={b} />
        ))}
      </div>
    </div>
  );
}

function BedarfCard({ bedarf }: { bedarf: any }) {
  const [showBc, setShowBc] = useState(false);
  const ort = bedarf.einrichtung?.ort || bedarf.einrichtung?.name || "—";
  const datumStr = format(new Date(bedarf.datum), "dd.MM.yyyy");
  const sendBroadcast = useServerFn(sendBedarfBroadcast);
  const mBroadcast = useMutation({
    mutationFn: () => sendBroadcast({ data: { bedarf_id: bedarf.id } }),
    onSuccess: (r: any) => {
      if (r.gesamt === 0) toast.message("Kein passender Mitarbeiter mit verknüpftem Telegram-Bot gefunden.");
      else toast.success(`Telegram-Broadcast an ${r.gesendet}/${r.gesamt} Mitarbeiter gesendet`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const broadcastText = `Pflegekraft gesucht in ${ort} — ${DIENST_LANG[bedarf.dienst] ?? bedarf.dienst}dienst am ${datumStr}. Wer kann? Bitte melden.`;
  const copyBroadcast = async () => {
    try { await navigator.clipboard.writeText(broadcastText); toast.success("Broadcast-Text kopiert"); }
    catch { toast.error("Konnte nicht kopieren"); }
  };

  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <div className="border-b bg-muted/40 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="font-mono text-sm tabular-nums">
          {format(new Date(bedarf.datum), "EEE dd.MM.yyyy")}
        </div>
        <Badge>{bedarf.dienst}</Badge>
        <Badge variant="secondary">{bedarf.qualifikation}</Badge>
        <div className="text-sm">
          <span className="font-medium">{bedarf.einrichtung?.name ?? "—"}</span>
          {bedarf.einrichtung?.ort ? <span className="text-muted-foreground">, {bedarf.einrichtung.ort}</span> : null}
        </div>
        {bedarf.anzahl > 1 && <Badge variant="outline">×{bedarf.anzahl}</Badge>}
        {bedarf.notiz && <div className="text-xs text-muted-foreground max-w-md truncate">{bedarf.notiz}</div>}
        <Button size="sm" className="ml-auto" onClick={() => mBroadcast.mutate()} disabled={mBroadcast.isPending}>
          <Send className="mr-1 h-3.5 w-3.5" /> Telegram-Broadcast
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowBc((v) => !v)}>
          <Megaphone className="mr-1 h-3.5 w-3.5" /> Niemand erreicht
        </Button>
      </div>

      {showBc && (
        <div className="border-b bg-amber-50 px-4 py-3 dark:bg-amber-950/20">
          <div className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">
            Broadcast-Text (zum Verteilen, z. B. per WhatsApp-Gruppe):
          </div>
          <Textarea readOnly rows={2} value={broadcastText} className="bg-card text-sm" onFocus={(e) => e.currentTarget.select()} />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={copyBroadcast}><Copy className="mr-1 h-3.5 w-3.5" /> Text kopieren</Button>
          </div>
        </div>
      )}

      {bedarf.anrufliste.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          Keine passenden Mitarbeiter mit Verfügbarkeit „frei" für {bedarf.dienst} am {format(new Date(bedarf.datum), "dd.MM.yyyy")}.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mitarbeiter</TableHead>
              <TableHead>Qualifikation</TableHead>
              <TableHead>Entfernung</TableHead>
              <TableHead>Telefon</TableHead>
              <TableHead className="text-right">Aktion</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bedarf.anrufliste.map((m: any) => (
              <AnruflisteRow key={m.id} bedarf={bedarf} mitarbeiter={m} />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function AnruflisteRow({ bedarf, mitarbeiter }: { bedarf: any; mitarbeiter: any }) {
  const qc = useQueryClient();
  const zusage = useServerFn(bedarfZusage);
  const absage = useServerFn(bedarfAbsage);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dispo-offene"] });
    qc.invalidateQueries({ queryKey: ["plan"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const mZusage = useMutation({
    mutationFn: () => zusage({ data: { bedarf_id: bedarf.id, mitarbeiter_id: mitarbeiter.id } }),
    onSuccess: () => { toast.success(`Zusage von ${mitarbeiter.kuerzel} – Bedarf besetzt`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const mAbsage = useMutation({
    mutationFn: () => absage({ data: { bedarf_id: bedarf.id, mitarbeiter_id: mitarbeiter.id } }),
    onSuccess: () => { toast.success(`Absage von ${mitarbeiter.kuerzel} vermerkt`); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const busy = mZusage.isPending || mAbsage.isPending;
  const phone = (mitarbeiter.telefon ?? "").replace(/\s/g, "");

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{mitarbeiter.nachname}, {mitarbeiter.vorname}</div>
        <div className="text-xs text-muted-foreground font-mono">{mitarbeiter.kuerzel}</div>
      </TableCell>
      <TableCell><Badge variant="secondary">{mitarbeiter.qualifikation}</Badge></TableCell>
      <TableCell className="tabular-nums">
        {mitarbeiter.distanz_km != null ? (
          (() => {
            const d = mitarbeiter.distanz_km as number;
            const limit = mitarbeiter.limit_km as number | null;
            const knapp = limit != null && d >= limit * 0.9;
            return (
              <div className="flex items-center gap-2">
                <span>≈ {d < 10 ? d.toFixed(1) : Math.round(d)} km Luftlinie</span>
                {limit != null && (
                  <span className="text-xs text-muted-foreground">/ {Math.round(limit)} km</span>
                )}
                {knapp && (
                  <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400 text-[10px] px-1.5 py-0">
                    knapp
                  </Badge>
                )}
              </div>
            );
          })()
        ) : mitarbeiter.umkreis_km != null ? (
          `${mitarbeiter.umkreis_km} km`
        ) : (
          <span className="text-muted-foreground" title="Keine Geo-Daten">—</span>
        )}
      </TableCell>


      <TableCell>
        {phone ? (
          <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-primary hover:underline">
            <Phone className="h-3 w-3" /> {mitarbeiter.telefon}
          </a>
        ) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" onClick={() => mZusage.mutate()} disabled={busy}>
            <Check className="h-3.5 w-3.5 mr-1" /> Zusage
          </Button>
          <Button size="sm" variant="outline" onClick={() => mAbsage.mutate()} disabled={busy}>
            <X className="h-3.5 w-3.5 mr-1" /> Absage
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
