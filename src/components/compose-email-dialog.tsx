import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sendeFreemail } from "@/lib/freemail.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";

export type ComposeRefs = {
  mitarbeiter_id?: string | null;
  einrichtung_id?: string | null;
  bedarf_id?: string | null;
  anfrage_id?: string | null;
  referenz_typ?: string | null;
  referenz_id?: string | null;
};

export function ComposeEmailDialog({
  open,
  onOpenChange,
  defaultTo = "",
  defaultSubject = "",
  defaultBody = "",
  refs,
  inboxId,
  title = "E-Mail senden",
  onSent,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultTo?: string;
  defaultSubject?: string;
  defaultBody?: string;
  refs?: ComposeRefs;
  inboxId?: string | null;
  title?: string;
  onSent?: () => void;
}) {
  const sendFn = useServerFn(sendeFreemail);
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);

  useEffect(() => {
    if (open) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody(defaultBody);
    }
  }, [open, defaultTo, defaultSubject, defaultBody]);

  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          to: to.trim(),
          subject: subject.trim(),
          body_text: body,
          refs,
          inbox_id: inboxId ?? null,
        } as never,
      }),
    onSuccess: (res: any) => {
      if (res?.ok) {
        toast.success("E-Mail wurde versendet.");
        onSent?.();
        onOpenChange(false);
      } else {
        toast.error(`Versand fehlgeschlagen: ${res?.fehler ?? "Unbekannt"}`);
      }
    },
    onError: (e: any) => toast.error(`Versand fehlgeschlagen: ${e?.message ?? "Unbekannt"}`),
  });

  const valid = /.+@.+\..+/.test(to.trim()) && subject.trim().length > 0 && body.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />{title}</DialogTitle>
          <DialogDescription>
            Absender: <span className="font-mono">noreply@notify.dispoplan.one</span> · Eingang im Versand-Protokoll sichtbar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">An</Label>
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="empfaenger@beispiel.de" />
          </div>
          <div>
            <Label className="text-xs">Betreff</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={500} />
          </div>
          <div>
            <Label className="text-xs">Nachricht</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} maxLength={20000} />
            <div className="mt-1 text-[10px] text-muted-foreground text-right">{body.length} / 20.000</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button disabled={!valid || send.isPending} onClick={() => send.mutate()}>
            <Send className="h-4 w-4 mr-2" />{send.isPending ? "Sende…" : "Senden"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
