import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [state, setState] = useState<"loading" | "ready" | "done" | "invalid" | "already" | "error">("loading");
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setState("invalid"); return; }
        if (j.valid === false && j.reason === "already_unsubscribed") { setState("already"); return; }
        if (j.valid) { setState("ready"); return; }
        setState("invalid");
      })
      .catch((e) => { setErr(String(e)); setState("error"); });
  }, [token]);

  const confirm = () => {
    setState("loading");
    fetch(`/email/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (j.success) setState("done");
      else if (j.reason === "already_unsubscribed") setState("already");
      else { setErr(j.error ?? "Fehler"); setState("error"); }
    }).catch((e) => { setErr(String(e)); setState("error"); });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <div className="max-w-md w-full bg-card border rounded-xl p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Mail className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Newsletter / Benachrichtigungen abbestellen</h1>
        {state === "loading" && <p className="text-sm text-muted-foreground">Bitte warten…</p>}
        {state === "ready" && (
          <>
            <p className="text-sm text-muted-foreground mb-6">Klicken Sie unten, um den Empfang weiterer E-Mails von DispoPlan zu beenden.</p>
            <Button onClick={confirm} className="w-full">Abmeldung bestätigen</Button>
          </>
        )}
        {state === "done" && (
          <div className="space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
            <p className="text-sm">Sie wurden erfolgreich abgemeldet. Sie erhalten keine weiteren E-Mails von uns.</p>
          </div>
        )}
        {state === "already" && (
          <div className="space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
            <p className="text-sm">Sie sind bereits abgemeldet.</p>
          </div>
        )}
        {(state === "invalid" || state === "error") && (
          <div className="space-y-2">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm text-destructive">{err || "Ungültiger oder abgelaufener Link."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
