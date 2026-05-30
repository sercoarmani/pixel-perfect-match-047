import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPinned, Play, Square, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getGeocodePending, runGeocodingAllPending } from "@/lib/geocoding.functions";
import { toast } from "sonner";

const CHUNK = 50;

export function GeocodeRunAllCard() {
  const qc = useQueryClient();
  const fetchPending = useServerFn(getGeocodePending);
  const runChunk = useServerFn(runGeocodingAllPending);

  const { data: pending, isFetching, refetch } = useQuery({
    queryKey: ["geocode-pending"],
    queryFn: () => fetchPending(),
    staleTime: 10_000,
  });

  const [running, setRunning] = useState(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [totalAtStart, setTotalAtStart] = useState(0);
  const [done, setDone] = useState(0);
  const [success, setSuccess] = useState(0);
  const [failed, setFailed] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  async function start() {
    const initial = pending?.total_pending ?? 0;
    if (initial === 0) {
      toast.info("Keine offenen Adressen.");
      return;
    }
    setRunning(true);
    setStopRequested(false);
    setTotalAtStart(initial);
    setDone(0);
    setSuccess(0);
    setFailed(0);
    setLastError(null);

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const r = await runChunk({ data: { chunk_size: CHUNK } });
        if (!r.ok) {
          setLastError(r.error);
          toast.error(`Geocoding-Lauf abgebrochen: ${r.error}`);
          break;
        }
        setDone((d) => d + r.processed);
        setSuccess((s) => s + r.success);
        setFailed((f) => f + r.failed);
        // Invalidate related queries so listings refresh
        qc.invalidateQueries({ queryKey: ["mitarbeiter"] });
        qc.invalidateQueries({ queryKey: ["einrichtungen"] });

        if (r.processed === 0 || r.remaining === 0) break;
        if (stopRequested) {
          toast.info("Geocoding-Lauf gestoppt.");
          break;
        }
      }
      toast.success("Geocoding-Lauf beendet.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
      setStopRequested(false);
      refetch();
    }
  }

  const total = pending?.total_pending ?? 0;
  const pct = totalAtStart > 0 ? Math.min(100, Math.round((done / totalAtStart) * 100)) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPinned className="h-4 w-4 text-muted-foreground" />
            Geocoding-Stapellauf
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching || running}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Verarbeitet alle offenen Adressen (Mitarbeiter & Einrichtungen) via Nominatim –
          ca. 1 Sekunde pro Adresse. Der Lauf läuft im Browser-Tab; bei Bedarf stoppen.
        </p>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Mitarbeiter offen: <span className="ml-1 font-mono">{pending?.mitarbeiter_pending ?? "…"}</span></Badge>
          <Badge variant="outline">Einrichtungen offen: <span className="ml-1 font-mono">{pending?.einrichtungen_pending ?? "…"}</span></Badge>
          <Badge variant="outline">Gesamt: <span className="ml-1 font-mono">{total}</span></Badge>
        </div>

        {running && (
          <div className="space-y-1">
            <Progress value={pct} />
            <div className="text-xs text-muted-foreground">
              {done}/{totalAtStart} · ok {success} · Fehler {failed}
            </div>
          </div>
        )}
        {!running && done > 0 && (
          <div className="text-xs text-muted-foreground">
            Letzter Lauf: {done} verarbeitet · ok {success} · Fehler {failed}
          </div>
        )}
        {lastError && (
          <div className="text-xs text-destructive">Fehler: {lastError}</div>
        )}

        <div className="flex gap-2">
          {!running ? (
            <Button size="sm" onClick={start} disabled={total === 0}>
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Stapellauf starten
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setStopRequested(true)} disabled={stopRequested}>
              <Square className="mr-1.5 h-3.5 w-3.5" />
              {stopRequested ? "Stoppe…" : "Stoppen"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
