import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addDays, format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Plus, Trash2, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getPlanData, upsertEinsatz, deleteEinsatz, getMitarbeiterDienstplan } from "@/lib/dispo.functions";
import { generateDienstplanPdf } from "@/lib/pdf-dienstplan";
import { exportPlanungslisteExcel, exportPlanungslistePdf } from "@/lib/excel-planungsliste";
import { startOfMonth, endOfMonth } from "date-fns";
import {
  DIENSTE, DIENST_KURZ, STATUS_LABEL, STATUS_CLASS,
  buildDateRange, fmtIsoDate, weekStart, type Dienst, type EinsatzStatus,
} from "@/lib/dispo-utils";

export const Route = createFileRoute("/_authenticated/plan")({
  component: PlanPage,
});

type Einsatz = {
  id: string;
  mitarbeiter_id: string;
  einrichtung_id: string;
  datum: string;
  dienst: Dienst;
  status: EinsatzStatus;
  notiz: string | null;
};

function PlanPage() {
  const [anchor, setAnchor] = useState(() => weekStart(new Date()));
  const [days, setDays] = useState(14);
  const [qualFilter, setQualFilter] = useState<string>("ALLE");
  const [anstFilter, setAnstFilter] = useState<string>("ALLE");
  const [edit, setEdit] = useState<{ mitarbeiter_id: string; datum: string; existing?: Einsatz } | null>(null);

  const dateRange = useMemo(() => buildDateRange(anchor, days), [anchor, days]);
  const von = fmtIsoDate(dateRange[0]);
  const bis = fmtIsoDate(dateRange[dateRange.length - 1]);

  const fetchPlan = useServerFn(getPlanData);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["plan", von, bis],
    queryFn: () => fetchPlan({ data: { von, bis } }),
  });

  const QUAL_GROUP = (q: string) => (q === "PFK" ? "PFK" : q === "PHK" ? "PHK" : "Sonstige");
  const ANST_ORDER: Record<string, number> = { Vollzeit: 0, Teilzeit: 1, Minijob: 2 };

  const grouped = useMemo(() => {
    const list = (data?.mitarbeiter ?? []).filter((m: any) => {
      if (qualFilter !== "ALLE" && QUAL_GROUP(m.qualifikation) !== qualFilter) return false;
      if (anstFilter === "VZ_TZ" && !(m.anstellung === "Vollzeit" || m.anstellung === "Teilzeit")) return false;
      if (anstFilter !== "ALLE" && anstFilter !== "VZ_TZ" && m.anstellung !== anstFilter) return false;
      return true;
    });
    list.sort((a: any, b: any) => {
      const g = QUAL_GROUP(a.qualifikation).localeCompare(QUAL_GROUP(b.qualifikation));
      if (g !== 0) return g;
      const an = (ANST_ORDER[a.anstellung] ?? 9) - (ANST_ORDER[b.anstellung] ?? 9);
      if (an !== 0) return an;
      return a.nachname.localeCompare(b.nachname);
    });
    const groups: { key: string; label: string; items: any[] }[] = [];
    list.forEach((m: any) => {
      const key = `${QUAL_GROUP(m.qualifikation)} · ${m.anstellung}`;
      let g = groups.find((x) => x.key === key);
      if (!g) { g = { key, label: key, items: [] }; groups.push(g); }
      g.items.push(m);
    });
    return groups;
  }, [data, qualFilter, anstFilter]);


  const einsatzByCell = useMemo(() => {
    const map = new Map<string, Einsatz>();
    data?.einsaetze.forEach((e: any) => {
      map.set(`${e.mitarbeiter_id}|${e.datum}`, e);
    });
    return map;
  }, [data]);

  const abwByCell = useMemo(() => {
    const map = new Map<string, string>();
    data?.abwesenheiten.forEach((a: any) => {
      map.set(`${a.mitarbeiter_id}|${a.datum}`, a.art);
    });
    return map;
  }, [data]);

  const verfByCell = useMemo(() => {
    const map = new Map<string, boolean>();
    data?.verfuegbarkeiten.forEach((v: any) => {
      map.set(`${v.mitarbeiter_id}|${v.datum}|${v.dienst}`, v.verfuegbar);
    });
    return map;
  }, [data]);

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-lg font-semibold">Planungsmatrix</h1>
          <p className="text-xs text-muted-foreground">
            {format(dateRange[0], "dd.MM.yyyy", { locale: de })} – {format(dateRange[dateRange.length - 1], "dd.MM.yyyy", { locale: de })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDays(anchor, -7))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(weekStart(new Date()))}>Heute</Button>
          <Button variant="outline" size="icon" onClick={() => setAnchor(addDays(anchor, 7))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Select value={qualFilter} onValueChange={setQualFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALLE">Alle Quali</SelectItem>
              <SelectItem value="PFK">PFK</SelectItem>
              <SelectItem value="PHK">PHK</SelectItem>
              <SelectItem value="Sonstige">Sonstige</SelectItem>
            </SelectContent>
          </Select>
          <Select value={anstFilter} onValueChange={setAnstFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALLE">Alle Anstellung</SelectItem>
              <SelectItem value="VZ_TZ">Vollzeit / Teilzeit</SelectItem>
              <SelectItem value="Vollzeit">Vollzeit</SelectItem>
              <SelectItem value="Teilzeit">Teilzeit</SelectItem>
              <SelectItem value="Minijob">Minijob</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 Tage</SelectItem>
              <SelectItem value="14">14 Tage</SelectItem>
              <SelectItem value="28">28 Tage</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              try {
                exportPlanungslistePdf({
                  mitarbeiter: data?.mitarbeiter ?? [],
                  einsaetze: data?.einsaetze ?? [],
                  abwesenheiten: data?.abwesenheiten ?? [],
                  einrichtungen: data?.einrichtungen ?? [],
                  dateRange,
                });
              } catch (e: any) { toast.error(e?.message ?? "PDF-Export fehlgeschlagen"); }
            }}
            disabled={isLoading}
            title="Planungsliste als PDF exportieren"
          >
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              try {
                exportPlanungslisteExcel({
                  mitarbeiter: data?.mitarbeiter ?? [],
                  einsaetze: data?.einsaetze ?? [],
                  abwesenheiten: data?.abwesenheiten ?? [],
                  einrichtungen: data?.einrichtungen ?? [],
                  dateRange,
                });
              } catch (e: any) { toast.error(e?.message ?? "Excel-Export fehlgeschlagen"); }
            }}
            disabled={isLoading}
            title="Planungsliste als Excel exportieren"
          >
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-8 text-sm text-muted-foreground">Lade Plan…</div>
        ) : (
          <table className="border-separate border-spacing-0 text-xs tabular-nums">
            <thead className="sticky top-0 z-20 bg-card">
              <tr>
                <th className="sticky left-0 z-30 min-w-[180px] border-b border-r bg-card px-3 py-2 text-left">
                  Mitarbeiter
                </th>
                {dateRange.map((d) => {
                  const wknd = [0, 6].includes(d.getDay());
                  return (
                    <th key={d.toISOString()} className={cn(
                      "min-w-[64px] border-b border-r px-1 py-2 text-center font-medium",
                      wknd && "bg-muted/40",
                    )}>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        {format(d, "EEE", { locale: de })}
                      </div>
                      <div>{format(d, "dd.MM.")}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {grouped.map((g) => (
                <Fragment key={g.key}>
                  <tr>
                    <td colSpan={dateRange.length + 1} className="sticky left-0 z-10 bg-muted/60 border-b px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {g.label} <span className="ml-2 font-normal normal-case">({g.items.length})</span>
                    </td>
                  </tr>
                  {g.items.map((m: any) => (
                    <tr key={m.id} className="group">
                      <td className="sticky left-0 z-10 border-b border-r bg-card px-3 py-2">
                        <div className="font-medium">{m.kuerzel}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {m.nachname}, {m.vorname} · {m.qualifikation}
                        </div>
                      </td>
                      {dateRange.map((d) => {
                        const iso = fmtIsoDate(d);
                        const key = `${m.id}|${iso}`;
                        const e = einsatzByCell.get(key);
                        const abw = abwByCell.get(key);
                        const ein = e ? data!.einrichtungen.find((x: any) => x.id === e.einrichtung_id) : null;
                        const wknd = [0, 6].includes(d.getDay());
                        const verfMarks = DIENSTE.filter((di) => verfByCell.get(`${m.id}|${iso}|${di}`) === true);
                        return (
                          <td
                            key={iso}
                            className={cn(
                              "h-12 cursor-pointer border-b border-r p-1 align-top transition-colors",
                              wknd && !e && "bg-muted/30",
                              !e && "hover:bg-accent/50",
                            )}
                            onClick={() => setEdit({ mitarbeiter_id: m.id, datum: iso, existing: e as Einsatz | undefined })}
                          >
                            {abw ? (
                              <div className="text-[10px] text-muted-foreground italic">{abw}</div>
                            ) : e ? (
                              <div className={cn("rounded px-1 py-0.5 text-[10px] leading-tight", STATUS_CLASS[e.status])}>
                                <div className="font-bold">{DIENST_KURZ[e.dienst]}</div>
                                <div className="truncate">{ein?.name ?? "?"}</div>
                              </div>
                            ) : verfMarks.length > 0 ? (
                              <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
                                ✓ {verfMarks.join("")}
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {edit && (
        <EinsatzDialog
          open
          onClose={() => setEdit(null)}
          mitarbeiterId={edit.mitarbeiter_id}
          datum={edit.datum}
          existing={edit.existing}
          einrichtungen={data?.einrichtungen ?? []}
          mitarbeiterName={data?.mitarbeiter.find((m: any) => m.id === edit.mitarbeiter_id)?.kuerzel ?? ""}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["plan"] });
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}

function EinsatzDialog({
  open, onClose, mitarbeiterId, datum, existing, einrichtungen, mitarbeiterName, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mitarbeiterId: string;
  datum: string;
  existing?: Einsatz;
  einrichtungen: any[];
  mitarbeiterName: string;
  onSaved: () => void;
}) {
  const [einrichtungId, setEinrichtungId] = useState(existing?.einrichtung_id ?? einrichtungen[0]?.id ?? "");
  const [dienst, setDienst] = useState<Dienst>(existing?.dienst ?? "F");
  const [status, setStatus] = useState<EinsatzStatus>(existing?.status ?? "GEPLANT");
  const [notiz, setNotiz] = useState(existing?.notiz ?? "");

  const upsert = useServerFn(upsertEinsatz);
  const del = useServerFn(deleteEinsatz);
  const fetchPlan = useServerFn(getMitarbeiterDienstplan);

  const saveMut = useMutation({
    mutationFn: () => upsert({ data: { id: existing?.id, mitarbeiter_id: mitarbeiterId, einrichtung_id: einrichtungId, datum, dienst, status, notiz } }),
    onSuccess: async () => {
      if (status === "BESTAETIGT") {
        toast.success("Einsatz bestätigt – PDF wird erstellt …");
        try {
          const ref = new Date(datum);
          const von = fmtIsoDate(startOfMonth(ref));
          const bis = fmtIsoDate(endOfMonth(ref));
          const res: any = await fetchPlan({ data: { mitarbeiter_id: mitarbeiterId, von, bis } });
          generateDienstplanPdf({ mitarbeiter: res.mitarbeiter, einsaetze: res.einsaetze, abwesenheiten: res.abwesenheiten, von, bis });
        } catch (e: any) {
          toast.error(e.message ?? "PDF konnte nicht erstellt werden");
        }
      } else {
        toast.success("Einsatz gespeichert");
      }
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: () => del({ data: { id: existing!.id } }),
    onSuccess: () => { toast.success("Einsatz gelöscht"); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Einsatz {existing ? "bearbeiten" : "anlegen"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="text-muted-foreground">
            <Badge variant="outline" className="mr-2">{mitarbeiterName}</Badge>
            {format(new Date(datum), "EEEE, dd.MM.yyyy", { locale: de })}
          </div>
          <div className="space-y-1.5">
            <Label>Einrichtung</Label>
            <Select value={einrichtungId} onValueChange={setEinrichtungId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {einrichtungen.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}{e.ort ? ` (${e.ort})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Dienst</Label>
              <Select value={dienst} onValueChange={(v) => setDienst(v as Dienst)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="F">F – Früh</SelectItem>
                  <SelectItem value="S">S – Spät</SelectItem>
                  <SelectItem value="N">N – Nacht</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EinsatzStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STATUS_LABEL) as EinsatzStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notiz</Label>
            <Textarea value={notiz ?? ""} onChange={(e) => setNotiz(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="flex justify-between gap-2 sm:justify-between">
          {existing ? (
            <Button variant="destructive" size="sm" onClick={() => delMut.mutate()} disabled={delMut.isPending}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Löschen
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Abbrechen</Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !einrichtungId}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Speichern
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
