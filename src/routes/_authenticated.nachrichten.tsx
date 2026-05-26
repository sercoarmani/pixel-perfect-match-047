import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { listTemplates, updateTemplate } from "@/lib/dispo.functions";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/nachrichten")({
  component: NachrichtenPage,
});

function NachrichtenPage() {
  const fetchT = useServerFn(listTemplates);
  const { data } = useQuery({ queryKey: ["templates"], queryFn: () => fetchT() });

  return (
    <div className="p-6">
      <h1 className="mb-1 text-2xl font-semibold">Nachrichten-Vorlagen</h1>
      <p className="mb-4 text-sm text-muted-foreground">Platzhalter: {"{name}"}, {"{zeitraum}"}, {"{link}"}</p>
      <div className="grid gap-4 lg:grid-cols-2">
        {data?.map((t: any) => <TemplateCard key={t.id} t={t} />)}
      </div>
    </div>
  );
}

function TemplateCard({ t }: { t: any }) {
  const [text, setText] = useState(t.text);
  useEffect(() => setText(t.text), [t.text]);
  const upd = useServerFn(updateTemplate);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => upd({ data: { id: t.id, text } }),
    onSuccess: () => { toast.success("Gespeichert"); qc.invalidateQueries({ queryKey: ["templates"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.bezeichnung}</CardTitle>
        <CardDescription className="font-mono text-xs">{t.schluessel}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
        <Button size="sm" onClick={() => m.mutate()} disabled={m.isPending || text === t.text}>Speichern</Button>
      </CardContent>
    </Card>
  );
}
