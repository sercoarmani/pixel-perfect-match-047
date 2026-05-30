import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listDokumente, createSignedUpload, registerDokument,
  extractDokument, getDokumentDownloadUrl, updateDokument, deleteDokument,
} from "@/lib/dokumente.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Upload, Download, Trash2, FileText, Sparkles, CheckCircle2, AlertCircle, Loader2,
} from "lucide-react";
import { format } from "date-fns";

const TYP_LABEL: Record<string, string> = {
  zertifikat: "Zertifikat",
  fuehrungszeugnis: "Führungszeugnis",
  profil: "Profil",
  sonstiges: "Sonstiges",
};

export function MitarbeiterDokumente({ mitarbeiterId }: { mitarbeiterId: string }) {
  const qc = useQueryClient();
  const fetchList = useServerFn(listDokumente);
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["dokumente", mitarbeiterId],
    queryFn: () => fetchList({ data: { mitarbeiter_id: mitarbeiterId } }),
  });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const signed = useServerFn(createSignedUpload);
  const register = useServerFn(registerDokument);
  const extract = useServerFn(extractDokument);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const { path, token } = await signed({
          data: { mitarbeiter_id: mitarbeiterId, filename: file.name },
        });
        const up = await supabase.storage
          .from("mitarbeiter-dokumente")
          .uploadToSignedUrl(path, token, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (up.error) throw new Error(up.error.message);
        const row = await register({
          data: {
            mitarbeiter_id: mitarbeiterId,
            typ: "sonstiges",
            datei_path: path,
            dateiname: file.name,
            mime_type: file.type || null,
            groesse_bytes: file.size,
            weitergabe_erlaubt: false,
          },
        });
        qc.invalidateQueries({ queryKey: ["dokumente", mitarbeiterId] });
        // KI-Extraktion async anstoßen
        extract({ data: { id: row.id } })
          .then(() => qc.invalidateQueries({ queryKey: ["dokumente", mitarbeiterId] }))
          .catch((e: any) => toast.warning(`KI-Extraktion fehlgeschlagen: ${e.message}`));
      }
      toast.success(`${files.length} Datei(en) hochgeladen – KI liest aus …`);
    } catch (e: any) {
      toast.error(e.message ?? "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-3 pt-2 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">Dokumente ({docs.length})</h3>
          <p className="text-xs text-muted-foreground">
            Zertifikate, Führungszeugnis, Profil … KI liest Felder aus und markiert sie als „bitte prüfen".
          </p>
        </div>
        <div>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*,.xlsx,.xls,.doc,.docx"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Button size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            Dateien hochladen
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Lade…</p>
      ) : docs.length === 0 ? (
        <div className="rounded border bg-muted/30 p-6 text-center text-muted-foreground">
          Noch keine Dokumente. Lade PDF, Foto oder Scan hoch.
        </div>
      ) : (
        <div className="rounded border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Datei</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead>Ausgestellt</TableHead>
                <TableHead>Ablauf</TableHead>
                <TableHead>Weitergabe</TableHead>
                <TableHead>KI</TableHead>
                <TableHead className="text-right">Aktionen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d: any) => <DokumentRow key={d.id} doc={d} mitarbeiterId={mitarbeiterId} />)}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function DokumentRow({ doc, mitarbeiterId }: { doc: any; mitarbeiterId: string }) {
  const qc = useQueryClient();
  const update = useServerFn(updateDokument);
  const del = useServerFn(deleteDokument);
  const dl = useServerFn(getDokumentDownloadUrl);
  const extract = useServerFn(extractDokument);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    typ: doc.typ,
    ausstellungsdatum: doc.ausstellungsdatum ?? "",
    ablaufdatum: doc.ablaufdatum ?? "",
    weitergabe_erlaubt: !!doc.weitergabe_erlaubt,
  });

  const saveMut = useMutation({
    mutationFn: () => update({
      data: {
        id: doc.id,
        typ: form.typ,
        ausstellungsdatum: form.ausstellungsdatum || null,
        ablaufdatum: form.ablaufdatum || null,
        weitergabe_erlaubt: form.weitergabe_erlaubt,
        erkannt_geprueft: true,
      },
    }),
    onSuccess: () => {
      toast.success("Gespeichert & als geprüft markiert");
      qc.invalidateQueries({ queryKey: ["dokumente", mitarbeiterId] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => del({ data: { id: doc.id } }),
    onSuccess: () => {
      toast.success("Gelöscht");
      qc.invalidateQueries({ queryKey: ["dokumente", mitarbeiterId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const extractMut = useMutation({
    mutationFn: () => extract({ data: { id: doc.id } }),
    onSuccess: () => {
      toast.success("KI-Extraktion abgeschlossen");
      qc.invalidateQueries({ queryKey: ["dokumente", mitarbeiterId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download() {
    try {
      const { url } = await dl({ data: { id: doc.id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  const heute = new Date().toISOString().slice(0, 10);
  const abl = doc.ablaufdatum as string | null;
  const ablaufBald = abl && abl >= heute && abl <= new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
  const abgelaufen = abl && abl < heute;

  return (
    <>
      <TableRow>
        <TableCell className="max-w-[200px]">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            <button onClick={download} className="truncate text-left text-primary hover:underline" title={doc.dateiname}>
              {doc.dateiname}
            </button>
          </div>
        </TableCell>
        <TableCell>
          {editing ? (
            <Select value={form.typ} onValueChange={(v) => setForm({ ...form, typ: v })}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYP_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Badge variant="secondary">{TYP_LABEL[doc.typ] ?? doc.typ}</Badge>
          )}
        </TableCell>
        <TableCell className="tabular-nums">
          {editing ? (
            <Input type="date" className="h-8 w-[140px]" value={form.ausstellungsdatum}
              onChange={(e) => setForm({ ...form, ausstellungsdatum: e.target.value })} />
          ) : doc.ausstellungsdatum ? format(new Date(doc.ausstellungsdatum), "dd.MM.yyyy") : "—"}
        </TableCell>
        <TableCell className="tabular-nums">
          {editing ? (
            <Input type="date" className="h-8 w-[140px]" value={form.ablaufdatum}
              onChange={(e) => setForm({ ...form, ablaufdatum: e.target.value })} />
          ) : abl ? (
            <span className={abgelaufen ? "text-destructive font-medium" : ablaufBald ? "text-amber-600 font-medium" : ""}>
              {format(new Date(abl), "dd.MM.yyyy")}
            </span>
          ) : "—"}
        </TableCell>
        <TableCell>
          {editing ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" className="h-4 w-4"
                checked={form.weitergabe_erlaubt}
                onChange={(e) => setForm({ ...form, weitergabe_erlaubt: e.target.checked })} />
              <span className="text-xs">erlaubt</span>
            </label>
          ) : doc.weitergabe_erlaubt ? (
            <Badge>Ja</Badge>
          ) : (
            <Badge variant="outline">Nein</Badge>
          )}
        </TableCell>
        <TableCell>
          {doc.erkannt_status === "pending" && <Badge variant="outline"><Loader2 className="mr-1 h-3 w-3 animate-spin" />liest…</Badge>}
          {doc.erkannt_status === "fehler" && (
            <Badge variant="destructive" title={doc.erkannt_fehler ?? ""}>
              <AlertCircle className="mr-1 h-3 w-3" />Fehler
            </Badge>
          )}
          {doc.erkannt_status === "ok" && !doc.erkannt_geprueft && (
            <Badge variant="secondary" title="Automatisch erkannt – bitte prüfen">
              <Sparkles className="mr-1 h-3 w-3" />prüfen
            </Badge>
          )}
          {doc.erkannt_status === "ok" && doc.erkannt_geprueft && (
            <Badge><CheckCircle2 className="mr-1 h-3 w-3" />geprüft</Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          <div className="flex justify-end gap-1">
            {!editing && (
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Bearbeiten</Button>
            )}
            {editing && (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Abbrechen</Button>
                <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Speichern</Button>
              </>
            )}
            <Button size="sm" variant="ghost" onClick={download} title="Download"><Download className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => extractMut.mutate()}
              disabled={extractMut.isPending} title="KI erneut auslesen">
              {extractMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive"
              onClick={() => { if (confirm(`"${doc.dateiname}" löschen?`)) delMut.mutate(); }}
              disabled={delMut.isPending} title="Löschen">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {doc.erkannt_json && !doc.erkannt_geprueft && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={7} className="text-xs">
            <span className="font-medium">KI-Erkennung (bitte prüfen):</span>{" "}
            {doc.erkannt_json.person_name && <span>Person: {doc.erkannt_json.person_name} · </span>}
            {doc.erkannt_json.aussteller && <span>Aussteller: {doc.erkannt_json.aussteller} · </span>}
            {doc.erkannt_json.betreff && <span>Betreff: {doc.erkannt_json.betreff} · </span>}
            {doc.erkannt_json.zusammenfassung && <span className="text-muted-foreground">{doc.erkannt_json.zusammenfassung}</span>}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
