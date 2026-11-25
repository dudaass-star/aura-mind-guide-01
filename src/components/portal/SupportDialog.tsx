import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { cn } from "@/lib/utils";

// Ajuda do App: dúvidas frequentes + chat imediato com a equipe (separado da conversa com a AURA).
// Limite de mensagens e encaminhamento para atendimento humano por e-mail são decididos no servidor.
const FAQ = [
  { q: "Como remarco um encontro?", a: "Abra Sessões no menu de baixo e toque no encontro marcado para escolher outro horário." },
  { q: "Como troco de plano?", a: "Nos três pontinhos, toque em Gerenciar assinatura." },
  { q: "Um áudio não toca. O que faço?", a: "Toque de novo no áudio: o App busca o arquivo outra vez. Se preferir, use Ler mensagem para ver o texto." },
  { q: "Não recebo os lembretes.", a: "Nos três pontinhos, abra Notificações e lembretes e ative os avisos neste aparelho." },
];
type Msg = { role: "user" | "assistant"; content: string; action?: string };

export function SupportDialog({ open, onOpenChange, onManageSubscription, onOpenSessions }: {
  open: boolean; onOpenChange: (open: boolean) => void; onManageSubscription?: () => void; onOpenSessions?: () => void;
}) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [handoff, setHandoff] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  const reset = (next: boolean) => {
    onOpenChange(next);
    if (!next) setTimeout(() => { setMessages([]); setText(""); setError(null); setOpenFaq(null); setHandoff(false); }, 200);
  };

  const send = async (override?: string) => {
    const content = (override ?? text).trim();
    if (content.length < 2 || sending || handoff) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next); setText(""); setSending(true); setError(null);
    const { data, error: fnError } = await supabasePortal.functions.invoke("portal-support-chat", {
      body: { messages: next.map(({ role, content }) => ({ role, content })) },
    });
    setSending(false);
    if (fnError || !data?.reply) {
      let msg = "Não conseguimos responder agora. Tente de novo em instantes.";
      try { const ctx = (fnError as { context?: Response })?.context; const b = ctx ? await ctx.json() : data; if (b?.error) msg = b.error; } catch { /* mantém padrão */ }
      setMessages(messages); setText(content); setError(msg); return;
    }
    setMessages([...next, { role: "assistant", content: data.reply, action: data.action }]);
    if (data.handoff) setHandoff(true);
  };

  const go = (fn?: () => void) => { reset(false); setTimeout(() => fn?.(), 250); };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="portal-dialog flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 text-left">
          <DialogTitle className="font-display text-xl font-semibold">Ajuda e suporte</DialogTitle>
          <DialogDescription>Conta, pagamento ou o App. Para conversar sobre você, a AURA continua na conversa.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-3">
          {messages.length === 0 && FAQ.map((item, i) => (
            <div key={item.q} className="rounded-2xl bg-foreground/5">
              <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}
                className="flex w-full items-center gap-3 px-4 py-3 text-left font-body text-sm font-semibold text-foreground">
                <span className="flex-1">{item.q}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", openFaq === i && "rotate-180")} />
              </button>
              {openFaq === i && <p className="px-4 pb-3 text-sm text-muted-foreground">{item.a}</p>}
            </div>
          ))}

          {messages.map((m, i) => (
            <div key={i} className={cn("flex flex-col gap-2", m.role === "user" ? "items-end" : "items-start")}>
              <p className={cn("max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 font-body text-sm leading-[1.5]",
                m.role === "user" ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-foreground/5 text-foreground")}>
                {m.content}
              </p>
              {m.action === "manage_subscription" && onManageSubscription && (
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => go(onManageSubscription)}>Abrir Gerenciar assinatura</Button>
              )}
              {m.action === "open_sessions" && onOpenSessions && (
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => go(onOpenSessions)}>Abrir Sessões</Button>
              )}
            </div>
          ))}
          {sending && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Escrevendo…</div>}
          <div ref={endRef} />
        </div>

        <div className="space-y-2 border-t border-foreground/10 px-6 pb-6 pt-3">
          {handoff ? (
            <Button type="button" className="w-full rounded-full" onClick={() => reset(false)}>Fechar</Button>
          ) : (
            <>
              <div className="flex items-end gap-2">
                <Textarea value={text} onChange={(e) => setText(e.target.value.slice(0, 1500))} rows={2}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={messages.length ? "Responder…" : "Conte o que aconteceu…"} className="min-h-0 flex-1 resize-none rounded-2xl font-body text-sm" />
                <Button type="button" size="icon" className="h-10 w-10 shrink-0 rounded-full" aria-label="Enviar" disabled={text.trim().length < 2 || sending} onClick={() => void send()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
              {messages.length > 0 && (
                <button type="button" disabled={sending} onClick={() => void send("Quero falar com uma pessoa da equipe.")}
                  className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
                  <Mail className="h-3.5 w-3.5" /> Prefiro falar com a equipe por e-mail
                </button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
