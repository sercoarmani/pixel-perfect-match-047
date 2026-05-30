import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, RefreshCw, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { geocodeSingle, runGeocoding } from "@/lib/geocoding.functions";
import { toast } from "sonner";

type Tabelle = "mitarbeiter" | "einrichtungen";

export function GeocodeStatusBadge({
  status,
  fehler,
  lat,
  lng,
}: {
  status?: string | null;
  fehler?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  if (status === "ok" && lat != null && lng != null) {
    return (
      <Badge variant="outline" className="gap-1 border-green-600/40 text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-3 w-3" /> geocodiert
      </Badge>
    );
  }
  if (status === "fehler") {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive" title={fehler ?? undefined}>
        <AlertTriangle className="h-3 w-3" /> Fehler
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Clock className="h-3 w-3" /> ausstehend
    </Badge>
  );
}

export function GeocodeSingleButton({
  tabelle,
  id,
  invalidateKey,
  size = "sm",
}: {
  tabelle: Tabelle;
  id: string;
  invalidateKey: string;
  size?: "sm" | "default";
}) {
  const qc = useQueryClient();
  const run = useServerFn(geocodeSingle);
  const m = useMutation({
    mutationFn: () => run({ data: { tabelle, id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Geocodiert (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)})`);
      else toast.error(`Geocoding fehlgeschlagen: ${r.error}`);
      qc.invalidateQueries({ queryKey: [invalidateKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={(e) => {
        e.stopPropagation();
        m.mutate();
      }}
      disabled={m.isPending}
      title="Adresse jetzt geokodieren"
    >
      <MapPin className={"h-3.5 w-3.5 " + (m.isPending ? "animate-pulse" : "")} />
      <span className="ml-1.5">Geokodieren</span>
    </Button>
  );
}

export function GeocodeBulkButton({
  tabelle,
  invalidateKey,
  limit = 25,
}: {
  tabelle: Tabelle;
  invalidateKey: string;
  limit?: number;
}) {
  const qc = useQueryClient();
  const run = useServerFn(runGeocoding);
  const m = useMutation({
    mutationFn: () => run({ data: { tabelle, limit, nur_pending: true } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(`Geocoding-Lauf fehlgeschlagen: ${r.error}`);
        return;
      }
      if (r.processed === 0) toast.info("Keine offenen Adressen.");
      else toast.success(`${r.success}/${r.processed} geokodiert (${r.failed} Fehler)`);
      qc.invalidateQueries({ queryKey: [invalidateKey] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => m.mutate()}
      disabled={m.isPending}
      title="Bis zu 25 offene Adressen geokodieren (Nominatim: 1 Req/s)"
    >
      <RefreshCw className={"mr-1 h-3.5 w-3.5 " + (m.isPending ? "animate-spin" : "")} />
      {m.isPending ? "Geokodiere…" : "Offene geokodieren"}
    </Button>
  );
}
