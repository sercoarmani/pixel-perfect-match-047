import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, Trash2, Plus, MessageSquare, Zap } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp";
import {
  getWhatsAppSettings,
  saveWhatsAppSettings,
  listWhatsAppTemplates,
  saveWhatsAppTemplate,
  deleteWhatsAppTemplate,
  type WhatsAppSettings,
  type WhatsAppTemplate,
} from "@/lib/whatsapp.functions";
import { toast } from "sonner";

export function WhatsAppSetupCard() {
  const fetchS = useServerFn(getWhatsAppSettings);
  const saveS = useServerFn(saveWhatsAppSettings);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["whatsapp-settings"], queryFn: () => fetchS() });
  const [draft, setDraft] = useState<WhatsAppSettings | null>(null);

  useEffect(() => { if (data) setDraft(data); }, [data]);

  const save = useMutation({
    mutationFn: (d: WhatsAppSettings) => saveS({ data: {
      provider: d.provider,
      twilio_account_sid: d.twilio_account_sid,
      twilio_from: d.twilio_from,
      meta_phone_number_id: d.meta_phone_number_id,
      meta_business_account_id: d.meta_business_account_id,
      default_language: d.default_language,
      aktiv: d.aktiv,
    }}),
    onSuccess: () => { toast.success("WhatsApp-Einstellungen gespeichert"); qc.invalidateQueries({ queryKey: ["whatsapp-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !draft) return <Card><CardContent className="py-6 text-sm text-muted-foreground">Lade WhatsApp-Einstellungen…</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <WhatsAppIcon className="h-4 w-4 text-green-600" /> WhatsApp-API
          </span>
          {draft.aktiv && draft.provider !== "none" ? (
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              aktiv ({draft.provider})
            </Badge>
          ) : (
            <Badge variant="outline">inaktiv</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select
            value={draft.provider}
            onValueChange={(v) => setDraft({ ...draft, provider: v as WhatsAppSettings["provider"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— deaktiviert —</SelectItem>
              <SelectItem value="twilio">Twilio (empfohlen)</SelectItem>
              <SelectItem value="meta">Meta WhatsApp Cloud API</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {draft.provider === "twilio" && (
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              <strong>Setup:</strong> Twilio-Connector im Workspace verbinden
              (Connectors → Twilio). Dann hier die WhatsApp-Sender-Nummer eintragen.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Account SID (optional, nur zur Anzeige)</Label>
              <Input
                value={draft.twilio_account_sid ?? ""}
                onChange={(e) => setDraft({ ...draft, twilio_account_sid: e.target.value })}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">WhatsApp-Absender</Label>
              <Input
                value={draft.twilio_from ?? ""}
                onChange={(e) => setDraft({ ...draft, twilio_from: e.target.value })}
                placeholder="+4915123456789 oder whatsapp:+14155238886 (Sandbox)"
              />
              <p className="text-[11px] text-muted-foreground">
                Format E.164 (mit +). Für Tests die Twilio-Sandbox-Nummer verwenden.
              </p>
            </div>
            <div className="text-xs">
              Connector-Status:{" "}
              {draft.twilio_secret_present ? (
                <span className="text-emerald-600">✓ TWILIO_API_KEY verfügbar</span>
              ) : (
                <span className="text-amber-600">⚠ Twilio nicht verbunden – im Bereich Connectors verbinden</span>
              )}
            </div>
          </div>
        )}

        {draft.provider === "meta" && (
          <div className="space-y-3 rounded-md border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground">
              <strong>Setup:</strong> WhatsApp Business Account in Meta Business Manager anlegen,
              Telefonnummer registrieren, Permanent Access Token erzeugen.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Phone Number ID</Label>
              <Input
                value={draft.meta_phone_number_id ?? ""}
                onChange={(e) => setDraft({ ...draft, meta_phone_number_id: e.target.value })}
                placeholder="z.B. 123456789012345"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Business Account ID (optional)</Label>
              <Input
                value={draft.meta_business_account_id ?? ""}
                onChange={(e) => setDraft({ ...draft, meta_business_account_id: e.target.value })}
                placeholder="WABA-ID"
              />
            </div>
            <div className="text-xs">
              Token-Status:{" "}
              {draft.meta_secret_present ? (
                <span className="text-emerald-600">✓ META_WHATSAPP_TOKEN gesetzt</span>
              ) : (
                <span className="text-amber-600">⚠ META_WHATSAPP_TOKEN fehlt – im Bereich Secrets hinzufügen</span>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Standard-Sprache</Label>
          <Input
            value={draft.default_language}
            onChange={(e) => setDraft({ ...draft, default_language: e.target.value })}
            placeholder="de"
            className="w-24"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="wa-aktiv" className="flex items-center gap-2 cursor-pointer">
            <Zap className="h-4 w-4 text-amber-500" />
            API-Versand aktivieren
          </Label>
          <Switch
            id="wa-aktiv"
            checked={draft.aktiv}
            onCheckedChange={(v) => setDraft({ ...draft, aktiv: v })}
            disabled={draft.provider === "none"}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => save.mutate(draft)} disabled={save.isPending}>
            <Save className="h-3.5 w-3.5 mr-1" /> Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function WhatsAppTemplatesCard() {
  const fetchT = useServerFn(listWhatsAppTemplates);
  const saveT = useServerFn(saveWhatsAppTemplate);
  const delT = useServerFn(deleteWhatsAppTemplate);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["whatsapp-templates"], queryFn: () => fetchT() });
  const [editing, setEditing] = useState<Partial<WhatsAppTemplate> | null>(null);

  const save = useMutation({
    mutationFn: (t: Partial<WhatsAppTemplate>) => saveT({ data: {
      id: t.id,
      provider: (t.provider ?? "twilio") as "twilio" | "meta",
      name: t.name ?? "",
      template_name: t.template_name ?? "",
      language_code: t.language_code ?? "de",
      body_preview: t.body_preview ?? "",
      variables: t.variables ?? [],
      aktiv: t.aktiv ?? true,
    }}),
    onSuccess: () => { toast.success("Vorlage gespeichert"); setEditing(null); qc.invalidateQueries({ queryKey: ["whatsapp-templates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => delT({ data: { id } }),
    onSuccess: () => { toast.success("Gelöscht"); qc.invalidateQueries({ queryKey: ["whatsapp-templates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> WhatsApp-Vorlagen
          </span>
          <Button size="sm" variant="outline" onClick={() => setEditing({ provider: "twilio", language_code: "de", aktiv: true, variables: [] })}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Neue Vorlage
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Für Massenversand an Empfänger ohne aktives 24h-Fenster ist ein vom Provider
          <strong> vorab genehmigtes Template</strong> nötig (Meta: Template-Name, Twilio: Content SID).
        </p>

        {(data ?? []).length === 0 && !editing && (
          <div className="rounded-md border border-dashed p-4 text-center text-muted-foreground">
            Noch keine Vorlagen angelegt.
          </div>
        )}

        {(data ?? []).map((t) => (
          <div key={t.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="font-medium flex items-center gap-2">
                {t.name}
                <Badge variant="outline" className="text-[10px]">{t.provider}</Badge>
                <Badge variant="outline" className="text-[10px]">{t.language_code}</Badge>
                {!t.aktiv && <Badge variant="outline" className="text-[10px]">inaktiv</Badge>}
              </div>
              <div className="text-xs text-muted-foreground font-mono truncate">{t.template_name}</div>
              {t.body_preview && (
                <div className="text-xs text-muted-foreground line-clamp-2">{t.body_preview}</div>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>Bearbeiten</Button>
              <Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          </div>
        ))}

        {editing && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Interner Name</Label>
                <Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="z.B. Bedarfsanfrage" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Provider</Label>
                <Select value={editing.provider ?? "twilio"} onValueChange={(v) => setEditing({ ...editing, provider: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twilio">Twilio</SelectItem>
                    <SelectItem value="meta">Meta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">
                  {editing.provider === "meta" ? "Template-Name (Meta)" : "Content SID (Twilio, HX…)"}
                </Label>
                <Input value={editing.template_name ?? ""} onChange={(e) => setEditing({ ...editing, template_name: e.target.value })} placeholder={editing.provider === "meta" ? "bedarf_anfrage_v1" : "HXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sprache</Label>
                <Input value={editing.language_code ?? "de"} onChange={(e) => setEditing({ ...editing, language_code: e.target.value })} className="w-24" />
              </div>
              <div className="space-y-1 flex items-end">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <Switch checked={editing.aktiv ?? true} onCheckedChange={(v) => setEditing({ ...editing, aktiv: v })} />
                  aktiv
                </label>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vorschau / Body</Label>
              <Textarea
                value={editing.body_preview ?? ""}
                onChange={(e) => setEditing({ ...editing, body_preview: e.target.value })}
                rows={3}
                placeholder="Hallo {{1}}, wir haben einen neuen Bedarf am {{2}}."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Abbrechen</Button>
              <Button size="sm" onClick={() => save.mutate(editing)} disabled={save.isPending}>
                <Save className="h-3.5 w-3.5 mr-1" /> Speichern
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
