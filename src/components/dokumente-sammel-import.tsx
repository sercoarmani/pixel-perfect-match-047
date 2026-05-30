import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createSignedUpload, registerDokument, extractDokument } from "@/lib/dokumente.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FolderUp, Upload, Trash2, Loader2, FileText, Sparkles } from "lucide-react";

type Row = {
  file: File;
  mitarbeiterId: string;
  status: "wartet" | "läuft" | "ok" | "fehler";
  fehler?: string;
};

const TYP_LABEL: Record<string, string> = {
  zertifikat: "Zertifikat",
  fuehrungszeugnis: "Führungszeugnis",
  profil: "Profil",
  sonstiges: "Sonstiges",
};

export function DokumenteSammelImport({ mitarbeiter }: { mitarbeiter: Array<{ id: string; vorname: string; nachname: string; kuerzel: string }> }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [defaultTyp, setDefaultTyp] = useState<string>("sonstiges");
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const signed = useServerFn(createSignedUpload);
  const register = useServerFn(registerDokument);
  const extract = useServerFn(extractDokument);

  const sortedMa = [...mitarbeiter].sort((a, b) =>
    `${a.nachname}${a.vorname}`.localeCompare(`${b.nachname}${b.vorname}`),
  );

  function tryGuessMitarbeiter(filename: string): string {
    const lower = filename.toLowerCase();
    for (const m of sortedMa) {
      if (m.kuerzel && lower.includes(m.kuerzel.toLowerCase())) return m.id;
    }
    for (const m of sortedMa) {
      if (m.nachname && lower.includes(m.nachname.toLowerCase())) return m.id;
    }
    return "";
  }

  function onFilesPicked(files: FileList | null) {
    if (!files) return;
    const next: Row[] = Array.from(files).map((f) => ({
      file: f,
      mitarbeiterId: tryGuessMitarbeiter(f.name),
      status: "wartet" as const,
    }));
    setRows((prev) => [...prev, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function uploadAll() {
    if (rows.some((r) => !r.mitarbeiterId)) {
      toast.error("Bitte jeder Datei einen Mitarbeiter zuordnen.");
      return;
    }
    setRunning(true);
    const updated = [...rows];
    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === "ok") continue;
      updated[i] = { ...updated[i], status: "läuft" };
      setRows([...updated]);
      try {
        const file = updated[i].file;
        const maId = updated[i].mitarbeiterId;
        const { path, token } = await signed({ data: { mitarbeiter_id: maId, filename: file.name } });
        const up = await supabase.storage
          .from("mitarbeiter-dokumente")
          .uploadToSignedUrl(path, token, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (up.error) throw new Error(up.error.message);
        const row = await register({
          data: {
            mitarbeiter_id: maId,
            typ: defaultTyp as any,
            datei_path: path,
            dateiname: file.name,
            mime_type: file.type || null,
            groesse_bytes: file.size,
            weitergabe_erlaubt: false,
          },
        });
        // KI im Hintergrund
        extract({ data: { id: row.id } })
          .then(() => qc.invalidateQueries({ queryKey: ["dokumente", maId] }))
          .catch(() => {});
        qc.invalidateQueries({ queryKey: ["dokumente", maId] });
        updated[i] = { ...updated[i], status: "ok" };
      } catch (e: any) {
        updated[i] = { ...updated[i], status: "fehler", fehler: e?.message ?? "Fehler" };
      }
      setRows([...updated]);
    }
    setRunning(false);
    const okCount = updated.filter((r) => r.status === "ok").length;
    toast.success(`${okCount}/${updated.length} Dateien hochgeladen.`);
  }

  function reset() {
    setRows([]);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FolderUp className="mr-1 h-4 w-4" /> Sammel-Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Dokumente-Sammel-Import</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/*,.xlsx,.xls,.doc,.docx"
              className="hidden"
              onChange={(e) => onFilesPicked(e.target.files)}
            />
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> Dateien wählen
            </Button>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Standard-Typ:</span>
              <Select value={defaultTyp} onValueChange={setDefaultTyp}>
                <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYP_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="ml-auto text-xs text-muted-foreground">
              {rows.length} Datei(en) · Zuordnung wird aus Kürzel/Name geschätzt
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded border bg-muted/30 p-8 text-center text-sm text-muted-foreground">
              Wähle mehrere Dateien aus. Du ordnest jede einzeln einem Mitarbeiter zu.
            </div>
          ) : (
            <div className="rounded border bg-card max-h-[55vh] overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs">
                  <tr>
                    <th className="text-left p-2">Datei</th>
                    <th className="text-left p-2">Mitarbeiter</th>
                    <th className="text-left p-2">Status</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2 max-w-[260px]">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate" title={r.file.name}>{r.file.name}</span>
                        </div>
                      </td>
                      <td className="p-2">
                        <Select
                          value={r.mitarbeiterId}
                          onValueChange={(v) => setRows((prev) => prev.map((x, i) => i === idx ? { ...x, mitarbeiterId: v } : x))}
                        >
                          <SelectTrigger className="h-8 w-[230px]">
                            <SelectValue placeholder="Mitarbeiter wählen…" />
                          </SelectTrigger>
                          <SelectContent>
                            {sortedMa.map((m) => (
                              <SelectItem key={m.id} value={m.id}>
                                {m.nachname}, {m.vorname} {m.kuerzel ? `· ${m.kuerzel}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        {r.status === "wartet" && <Badge variant="outline">wartet</Badge>}
                        {r.status === "läuft" && <Badge variant="secondary"><Loader2 className="mr-1 h-3 w-3 animate-spin" />läuft</Badge>}
                        {r.status === "ok" && <Badge><Sparkles className="mr-1 h-3 w-3" />hochgeladen</Badge>}
                        {r.status === "fehler" && <Badge variant="destructive" title={r.fehler}>Fehler</Badge>}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm" variant="ghost" className="text-destructive"
                          disabled={running}
                          onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={running}>Schließen</Button>
          <Button onClick={uploadAll} disabled={running || rows.length === 0}>
            {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            {running ? "Lädt…" : `Alle hochladen (${rows.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
