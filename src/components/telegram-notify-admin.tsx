import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Send, Trash2, Bell } from "lucide-react";
import {
  listTelegramRecipients,
  addTelegramRecipient,
  toggleTelegramRecipient,
  deleteTelegramRecipient,
  sendTelegramTest,
} from "@/lib/telegram-notify.functions";

export function TelegramNotifyCard() {
  const qc = useQueryClient();
  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["telegram-recipients"],
    queryFn: () => listTelegramRecipients(),
  });

  const [chatId, setChatId] = useState("");
  const [label, setLabel] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["telegram-recipients"] });

  const add = useMutation({
    mutationFn: (vars: { chat_id: number; label: string | null }) =>
      addTelegramRecipient({ data: vars }),
    onSuccess: () => { toast.success("Empfänger hinzugefügt"); setChatId(""); setLabel(""); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const toggle = useMutation({
    mutationFn: (vars: { id: string; aktiv: boolean }) => toggleTelegramRecipient({ data: vars }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteTelegramRecipient({ data: { id } }),
    onSuccess: () => { toast.success("Entfernt"); invalidate(); },
  });
  const test = useMutation({
    mutationFn: (chat_id: number) => sendTelegramTest({ data: { chat_id } }),
    onSuccess: () => toast.success("Testnachricht gesendet"),
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-4 w-4" /> Telegram-Benachrichtigungen bei neuen Anfragen
        </CardTitle>
        <CardDescription>
          Jeder Eintrag hier erhält automatisch eine Telegram-Nachricht, sobald eine neue Anfrage angelegt wird.
          Die <b>Chat-ID</b> erhältst du, indem du dem Bot eine Nachricht schickst und <code>/start</code> oder <code>/id</code> sendest.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Chat-ID (z.B. 123456789)"
            inputMode="numeric"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            className="sm:w-44"
          />
          <Input
            placeholder="Bezeichnung (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Button
            onClick={() => {
              const n = Number(chatId);
              if (!Number.isFinite(n) || n === 0) return toast.error("Bitte gültige Chat-ID eingeben");
              add.mutate({ chat_id: n, label: label.trim() || null });
            }}
            disabled={add.isPending}
          >
            Hinzufügen
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Lade…</div>
        ) : recipients.length === 0 ? (
          <div className="text-sm text-muted-foreground">Noch keine Empfänger konfiguriert.</div>
        ) : (
          <ul className="divide-y rounded-md border">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center gap-3 p-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.label || `Chat ${r.chat_id}`}</div>
                  <div className="text-xs text-muted-foreground">Chat-ID: {String(r.chat_id)}</div>
                </div>
                <Switch
                  checked={r.aktiv}
                  onCheckedChange={(v) => toggle.mutate({ id: r.id, aktiv: v })}
                  aria-label="Aktiv"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => test.mutate(Number(r.chat_id))}
                  disabled={test.isPending}
                  aria-label="Testnachricht senden"
                  title="Testnachricht"
                >
                  <Send className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => del.mutate(r.id)}
                  aria-label="Entfernen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
