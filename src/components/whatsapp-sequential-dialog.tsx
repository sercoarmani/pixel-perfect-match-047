import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, ChevronRight, SkipForward, X, Send, Zap } from "lucide-react";
import { WhatsAppIcon, normalizeWhatsAppPhone, openWhatsAppChats } from "@/components/icons/whatsapp";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getWhatsAppSettings,
  listWhatsAppTemplates,
  sendWhatsAppBroadcast,
} from "@/lib/whatsapp.functions";
import { toast } from "sonner";

export type WhatsAppRecipient = {
  id?: string | number;
  name: string;
  telefon?: string | null;
  text: string;
};

export function WhatsAppSequentialDialog({
  open,
  onOpenChange,
  recipients,
  title = "WhatsApp-Versand",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recipients: WhatsAppRecipient[];
  title?: string;
}) {
  const valid = useMemo(
    () => recipients.filter((r) => !!normalizeWhatsAppPhone(r.telefon)),
    [recipients],
  );
  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<number>>(() => new Set());
  const [powerMode, setPowerMode] = useState(false);

  // API-Versand
  const fetchSettings = useServerFn(getWhatsAppSettings);
  const fetchTemplates = useServerFn(listWhatsAppTemplates);
  const sendBroadcast = useServerFn(sendWhatsAppBroadcast);
  const { data: settings } = useQuery({
    queryKey: ["whatsapp-settings"],
    queryFn: () => fetchSettings(),
    enabled: open,
    staleTime: 60_000,
  });
  const { data: templates } = useQuery({
    queryKey: ["whatsapp-templates"],
    queryFn: () => fetchTemplates(),
    enabled: open && !!settings?.aktiv,
    staleTime: 60_000,
  });

  const apiAvailable = !!settings?.aktiv && settings.provider !== "none";
  const [apiMode, setApiMode] = useState(false);
  const [templateId, setTemplateId] = useState<string>("__freitext__");
  const [sending, setSending] = useState(false);
  const [apiResult, setApiResult] = useState<{ sent: number; failed: number } | null>(null);

  useEffect(() => {
    if (open) {
      setIndex(0);
      setDone(new Set());
      setPowerMode(false);
      setApiMode(false);
      setTemplateId("__freitext__");
      setApiResult(null);
    }
  }, [open]);

  const usableTemplates = (templates ?? []).filter(
    (t) => t.aktiv && (settings?.provider ? t.provider === settings.provider : true),
  );

  const current = valid[index];
  const total = valid.length;
  const finished = done.size >= total && total > 0;

  function openCurrentAndAdvance() {
    if (!current) return;
    const num = normalizeWhatsAppPhone(current.telefon);
    if (num) {
      const url = `https://wa.me/${num}?text=${encodeURIComponent(current.text)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setDone((prev) => new Set(prev).add(index));
    if (index + 1 < total) setIndex(index + 1);
  }

  function skip() {
    if (index + 1 < total) setIndex(index + 1);
  }

  function openAllAtOnce() {
    setPowerMode(true);
    openWhatsAppChats(
      valid.map((r) => ({ telefon: r.telefon, text: r.text })),
      (n) => toast.success(`${n} Tabs werden geöffnet. Bitte je Tab auf „Senden" tippen.`),
    );
    onOpenChange(false);
  }

  async function sendViaApi() {
    if (valid.length === 0) return;
    setSending(true);
    setApiResult(null);
    try {
      const useTpl = templateId !== "__freitext__";
      const res = await sendBroadcast({
        data: {
          template_id: useTpl ? templateId : null,
          freitext: useTpl ? undefined : valid[0]?.text,
          recipients: valid.map((r) => ({
            mitarbeiter_id: typeof r.id === "string" ? r.id : null,
            name: r.name,
            telefon: r.telefon || "",
            body: useTpl ? undefined : r.text,
            variables: useTpl ? [r.name] : undefined, // einfache Default-Variable: Name
          })),
        },
      });
      setApiResult({ sent: res.sent, failed: res.failed });
      if (res.failed === 0) toast.success(`${res.sent} Nachrichten gesendet.`);
      else toast.warning(`${res.sent} gesendet, ${res.failed} fehlgeschlagen.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Versand fehlgeschlagen");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <WhatsAppIcon className="h-4 w-4 text-green-600" /> {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          {apiAvailable && (
            <div className="rounded-md border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="api-mode" className="flex items-center gap-2 cursor-pointer">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span>
                    Echter API-Versand ({settings?.provider})
                    <span className="ml-1 text-xs text-muted-foreground">automatisch ohne Klick</span>
                  </span>
                </Label>
                <Switch id="api-mode" checked={apiMode} onCheckedChange={setApiMode} />
              </div>
              {apiMode && (
                <div className="mt-3 space-y-2">
                  <Label className="text-xs">Vorlage</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__freitext__">
                        Freitext (nur 24h-Fenster / Sandbox)
                      </SelectItem>
                      {usableTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} <span className="text-muted-foreground">({t.language_code})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templateId === "__freitext__" ? (
                    <p className="text-xs text-muted-foreground">
                      Freitext funktioniert nur bei Empfängern, die in den letzten 24h geantwortet haben
                      (bzw. in der Twilio-Sandbox dem Bot beigetreten sind). Für kalte Nummern bitte eine
                      genehmigte Vorlage wählen.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Variablen werden in Reihenfolge eingesetzt. Standardmäßig wird der
                      <strong> Name</strong> als <code>{"{{1}}"}</code> übergeben.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {!apiMode && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
              <strong>Manueller Modus:</strong> Für jeden Empfänger öffnet sich der Chat mit
              vorbereitetem Text – du musst dort jeweils auf <strong>Senden</strong> tippen.
              {!apiAvailable && (
                <> Für vollautomatischen Versand: WhatsApp-API in der Verwaltung einrichten.</>
              )}
            </div>
          )}

          {total === 0 ? (
            <p className="text-muted-foreground">Keine Empfänger mit gültiger Telefonnummer.</p>
          ) : apiMode ? (
            <div className="rounded-md border bg-card p-3 text-xs">
              <div>
                <strong>{total}</strong> Empfänger werden automatisch angeschrieben.
              </div>
              {apiResult && (
                <div className="mt-2">
                  ✅ Gesendet: <strong>{apiResult.sent}</strong> · ❌ Fehler:{" "}
                  <strong>{apiResult.failed}</strong>
                </div>
              )}
            </div>
          ) : finished ? (
            <div className="rounded-md border bg-card p-4 text-center">
              <Check className="mx-auto mb-2 h-8 w-8 text-green-600" />
              <p className="font-medium">Alle {total} Chats geöffnet.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Falls du noch nicht überall „Senden" gedrückt hast, prüfe deine offenen WhatsApp-Tabs.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Empfänger <strong>{index + 1}</strong> von <strong>{total}</strong>
                </span>
                <span>{done.size} geöffnet</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-green-600 transition-all"
                  style={{ width: `${(done.size / total) * 100}%` }}
                />
              </div>
              <div className="rounded-md border bg-card p-3">
                <div className="text-xs text-muted-foreground">Nächster Empfänger</div>
                <div className="mt-1 font-medium">{current?.name}</div>
                <div className="text-xs text-muted-foreground">
                  {normalizeWhatsAppPhone(current?.telefon)}
                </div>
              </div>
              <details className="text-xs">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Nachricht anzeigen
                </summary>
                <pre className="mt-2 whitespace-pre-wrap rounded border bg-muted/40 p-2 text-xs">
                  {current?.text}
                </pre>
              </details>
            </>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <div className="flex gap-2">
            {!apiMode && !finished && total > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={openAllAtOnce}
                disabled={powerMode}
                title="Öffnet alle Tabs auf einmal – kann vom Browser blockiert werden"
              >
                Alle auf einmal öffnen
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <X className="h-3.5 w-3.5 mr-1" />{" "}
              {finished || apiResult ? "Schließen" : "Abbrechen"}
            </Button>
            {apiMode ? (
              <Button
                onClick={sendViaApi}
                disabled={sending || total === 0 || !!apiResult}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Send className="h-3.5 w-3.5 mr-1" />
                {sending ? "Sende…" : `An ${total} senden`}
              </Button>
            ) : (
              !finished && total > 0 && (
                <>
                  <Button variant="outline" onClick={skip} disabled={index + 1 >= total}>
                    <SkipForward className="h-3.5 w-3.5 mr-1" /> Überspringen
                  </Button>
                  <Button
                    onClick={openCurrentAndAdvance}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <WhatsAppIcon className="h-3.5 w-3.5 mr-1" /> Chat öffnen
                    {index + 1 < total && <ChevronRight className="h-3.5 w-3.5 ml-1" />}
                  </Button>
                </>
              )
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
