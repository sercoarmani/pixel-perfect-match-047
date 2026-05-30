import { useState, useRef, useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { chatHelp } from "@/lib/chat-help.functions";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const STARTER = `Hallo 👋 Ich bin dein DispoPlan-Assistent. Frag mich z. B.:
- *Wie lege ich einen neuen Bedarf an?*
- *Was bedeutet das rote Signal am Posteingang?*
- *Wie verschicke ich eine Verfügbarkeitsabfrage?*`;

export function HelpChatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const { location } = useRouterState();
  const sendFn = useServerFn(chatHelp);

  const m = useMutation({
    mutationFn: (msgs: Msg[]) => sendFn({ data: { messages: msgs, currentRoute: location.pathname } }),
    onSuccess: (r) => setMessages((prev) => [...prev, { role: "assistant", content: r.reply }]),
    onError: (e: Error) =>
      setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${e.message}` }]),
  });

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, m.isPending]);

  const send = () => {
    const text = input.trim();
    if (!text || m.isPending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    m.mutate(next);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/20 transition hover:scale-105 hover:shadow-xl"
        aria-label="Hilfe-Assistent öffnen"
      >
        <Bot className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="border-b px-4 py-3 text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> DispoPlan-Assistent
            </SheetTitle>
            <SheetDescription className="text-xs">
              Stelle Fragen zu Funktionen, Workflows und Einstellungen.
            </SheetDescription>
          </SheetHeader>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 text-sm">
            {messages.length === 0 && (
              <div className="rounded-lg border bg-muted/40 p-3 text-muted-foreground">
                <ReactMarkdown>{STARTER}</ReactMarkdown>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-lg px-3 py-2",
                  msg.role === "user"
                    ? "ml-8 bg-primary text-primary-foreground"
                    : "mr-8 border bg-card",
                )}
              >
                <div className={cn("prose prose-sm max-w-none", msg.role === "user" && "prose-invert")}>
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              </div>
            ))}
            {m.isPending && (
              <div className="mr-8 rounded-lg border bg-card px-3 py-2 text-muted-foreground">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </span>
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex gap-2"
            >
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Frage stellen…"
                disabled={m.isPending}
                className="h-9"
              />
              <Button type="submit" size="sm" disabled={!input.trim() || m.isPending}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
