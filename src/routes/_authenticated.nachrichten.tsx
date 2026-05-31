import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMitarbeiter } from "@/lib/dispo.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MessageSquare, Send, Phone, PhoneCall, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/nachrichten")({
  component: KontaktPage,
});

function normalizePhone(p?: string | null) {
  if (!p) return "";
  return p.replace(/[^\d+]/g, "");
}

function KontaktPage() {
  const fetchMit = useServerFn(listMitarbeiter);
  const { data, isLoading } = useQuery({ queryKey: ["mitarbeiter"], queryFn: () => fetchMit() });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkMessage, setBulkMessage] = useState("");

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((m: any) => m.aktiv)
      .filter((m: any) => {
        if (!q) return true;
        return [m.vorname, m.nachname, m.kuerzel, m.telefon, m.telegram_username]
          .filter(Boolean)
          .some((v: string) => v.toLowerCase().includes(q));
      })
      .sort((a: any, b: any) => a.nachname.localeCompare(b.nachname));
  }, [data, search]);

  const selectableList = useMemo(() => list.filter((m: any) => normalizePhone(m.telefon)), [list]);
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);
  const selectedCount = selectedIds.length;
  const allSelected = selectableList.length > 0 && selectableList.every((m: any) => selected[m.id]);

  function toggleAll() {
    if (allSelected) {
      setSelected({});
    } else {
      const next: Record<string, boolean> = {};
      selectableList.forEach((m: any) => { next[m.id] = true; });
      setSelected(next);
    }
  }

  function sendBulkWhatsApp() {
    const text = bulkMessage.trim();
    if (!text) { toast.error("Bitte eine Nachricht eingeben."); return; }
    const recipients = selectableList.filter((m: any) => selected[m.id]);
    if (recipients.length === 0) { toast.error("Keine Empfänger ausgewählt."); return; }
    const encoded = encodeURIComponent(text);
    let opened = 0;
    recipients.forEach((m: any, i: number) => {
      const num = normalizePhone(m.telefon).replace(/^\+/, "");
      if (!num) return;
      setTimeout(() => {
        window.open(`https://wa.me/${num}?text=${encoded}`, "_blank", "noopener,noreferrer");
      }, i * 350);
      opened++;
    });
    toast.success(`${opened} WhatsApp-Chat(s) werden geöffnet. Bitte je Tab auf „Senden" tippen.`);
  }


  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" /> Mitarbeiterkontakt
          </h1>
          <p className="text-sm text-muted-foreground">
            Mitarbeiter direkt per Telegram oder WhatsApp anschreiben.
          </p>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suchen…"
          className="h-9 w-56"
        />
      </div>

      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <WhatsAppIcon className="h-4 w-4 text-green-600" /> WhatsApp-Sammelnachricht
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={bulkMessage}
            onChange={(e) => setBulkMessage(e.target.value)}
            placeholder="Nachricht eingeben, die an alle ausgewählten Mitarbeiter gesendet werden soll…"
            className="min-h-20"
          />
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-muted-foreground">
              {selectedCount} ausgewählt · Pro Empfänger öffnet sich ein WhatsApp-Tab mit vorbereitetem Text. Du musst dort jeweils auf „Senden" tippen.
            </div>
            <Button
              size="sm"
              onClick={sendBulkWhatsApp}
              disabled={selectedCount === 0 || !bulkMessage.trim()}
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
            >
              <Send className="h-3.5 w-3.5" /> An {selectedCount || ""} Empfänger senden
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Mitarbeiter ({list.length})</CardTitle>
          {selectableList.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
              Alle mit Telefonnummer auswählen
            </label>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <div className="text-sm text-muted-foreground">Lade…</div>}
          {!isLoading && list.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">Keine Mitarbeiter gefunden.</div>
          )}
          {list.map((m: any) => {
            const tel = normalizePhone(m.telefon);
            const waNumber = tel.replace(/^\+/, "");
            const tgUser = m.telegram_username?.replace(/^@/, "");
            return (
              <div key={m.id} className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 hover:bg-accent/40 transition-colors">
                <Checkbox
                  checked={!!selected[m.id]}
                  disabled={!waNumber}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [m.id]: !!v }))}
                  aria-label={`${m.vorname} ${m.nachname} auswählen`}
                />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {m.kuerzel?.slice(0, 2).toUpperCase() ?? "MA"}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.nachname}, {m.vorname}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{m.qualifikation}</Badge>
                    {m.telefon && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{m.telefon}</span>}
                    {tgUser && <span className="opacity-70">@{tgUser}</span>}
                  </div>
                </div>

                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  disabled={!tgUser && !m.telegram_chat_id}
                  className="h-8 gap-1.5"
                  title={tgUser ? `Telegram: @${tgUser}` : "Kein Telegram-Account verknüpft"}
                >
                  {tgUser ? (
                    <a href={`https://t.me/${tgUser}`} target="_blank" rel="noreferrer">
                      <TelegramIcon className="h-3.5 w-3.5" /> Telegram
                    </a>
                  ) : (
                    <span className="opacity-50 cursor-not-allowed">
                      <TelegramIcon className="h-3.5 w-3.5" /> Telegram
                    </span>
                  )}
                </Button>

                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  disabled={!waNumber}
                  className="h-8 gap-1.5"
                  title={waNumber ? `WhatsApp: ${m.telefon}` : "Keine Telefonnummer hinterlegt"}
                >
                  {waNumber ? (
                    <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer">
                      <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                    </a>
                  ) : (
                    <span className="opacity-50 cursor-not-allowed">
                      <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                    </span>
                  )}
                </Button>

                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  disabled={!tel}
                  className="h-8 gap-1.5"
                  title={tel ? `Anrufen: ${m.telefon}` : "Keine Telefonnummer hinterlegt"}
                >
                  {tel ? (
                    <a href={`tel:${tel}`}>
                      <PhoneCall className="h-3.5 w-3.5" /> Anrufen
                    </a>
                  ) : (
                    <span className="opacity-50 cursor-not-allowed">
                      <PhoneCall className="h-3.5 w-3.5" /> Anrufen
                    </span>
                  )}
                </Button>

                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  disabled={!m.email}
                  className="h-8 gap-1.5"
                  title={m.email ? `E-Mail: ${m.email}` : "Keine E-Mail hinterlegt"}
                >
                  {m.email ? (
                    <a href={`mailto:${m.email}`}>
                      <Mail className="h-3.5 w-3.5" /> E-Mail
                    </a>
                  ) : (
                    <span className="opacity-50 cursor-not-allowed">
                      <Mail className="h-3.5 w-3.5" /> E-Mail
                    </span>
                  )}
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.24 3.64 11.95c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  );
}
