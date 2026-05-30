import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { listExpiringDokumente } from "@/lib/dokumente.functions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, FileText } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";
import { de } from "date-fns/locale";

const TYP_LABEL: Record<string, string> = {
  zertifikat: "Zertifikat",
  fuehrungszeugnis: "Führungszeugnis",
  profil: "Profil",
  sonstiges: "Sonstiges",
};

export function DokumenteAblaufWidget({ tage = 60 }: { tage?: number }) {
  const fetchExp = useServerFn(listExpiringDokumente);
  const { data = [], isLoading } = useQuery({
    queryKey: ["dokumente-ablauf", tage],
    queryFn: () => fetchExp({ data: { tage } }),
    refetchInterval: 300_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Dokumente laufen ab
        </CardTitle>
        <CardDescription>
          {isLoading ? "Lade…" : `${data.length} Dokument(e) in den nächsten ${tage} Tagen`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!isLoading && data.length === 0 ? (
          <p className="text-sm text-muted-foreground">Alles im grünen Bereich.</p>
        ) : (
          <ul className="divide-y max-h-72 overflow-auto">
            {data.map((d: any) => {
              const tageBis = differenceInCalendarDays(new Date(d.ablaufdatum), new Date());
              const warn = tageBis <= 14;
              const ma = d.mitarbeiter;
              return (
                <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Link to="/mitarbeiter" className="font-medium hover:underline truncate" title={d.dateiname}>
                        {ma ? `${ma.vorname} ${ma.nachname}` : "—"}
                      </Link>
                      <Badge variant="secondary" className="text-[10px]">{TYP_LABEL[d.typ] ?? d.typ}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{d.dateiname}</div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <div className={"text-xs " + (warn ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {format(new Date(d.ablaufdatum), "dd.MM.yyyy", { locale: de })}
                    </div>
                    <div className={"text-[10px] " + (warn ? "text-destructive" : "text-muted-foreground")}>
                      in {tageBis} Tag{tageBis === 1 ? "" : "en"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
