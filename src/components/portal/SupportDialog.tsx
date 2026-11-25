import { useState } from "react";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabasePortal } from "@/integrations/supabase/portal-client";
import { cn } from "@/lib/utils";

// Ajuda operacional do App: dúvidas frequentes + mensagem para a equipe (separada da conversa com a AURA).
const FAQ = [
  { q: "Como remarco um encontro?", a: "Abra Sessões no menu de baixo e toque no encontro marcado para escolher outro horário." },
  { q: "Como troco de plano ou de pagamento?", a: "Nos três pontinhos, toque em Gerenciar assinatura. Lá ficam a troca de plano e a forma de pagamento." },
  { q: "Um áudio não toca. O que faço?", a: "Toque de novo no áudio: o App busca o arquivo outra vez. Se preferir, use Ler mensagem para ver o texto." },
  { q: "Não recebo os lembretes.", a: "Nos três pontinhos, abra Notificações e lembretes e ative os avisos neste aparelho." },
];
const TOPICS = [
  { id: "pagamento", label: "Pagamento" },
  { id: "sessoes", label: "Encontros" },
  { id: "tecnico", label: "Problema no App" },
  { id: "outro", label: "Outra dúvida" },
];

export function SupportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const reset = (next: boolean) => {
    onOpenChange(next);
    if (!next) setTimeout(() => { setSentTo(null); setMessage(""); setTopic(null); setError(null); setOpenFaq(null); }, 200);
  };

  const send = async () => {
    if (!topic || message.trim().length < 5 || sending) return;
    setSending(true); setError(null);
    const { data, error: fnError } = await supabasePortal.functions.invoke("portal-support-message", { body: { topic, message: message.trim() } });
    setSending(false);
    if (fnError || !data?.ok) {
      let msg = "Não conseguimos enviar agora. Tente de novo em instantes.";
      try { const ctx = (fnError as { context?: Response })?.context; const b = ctx ? await ctx.json() : data; if (b?.error) msg = b.error; } catch { /* mantém mensagem padrão */ }
      setError(msg); return;
    }
    setSentTo(data.email);
  };

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="portal-dialog max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="font-display text-xl font-semibold">Ajuda e suporte</DialogTitle>
          <DialogDescription>Dúvidas sobre conta, pagamento ou o App. Para conversar sobre você, a AURA continua na conversa.</DialogDescription>
        </DialogHeader>

        {sentTo ? (
          <div className="space-y-4 py-2 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <p className="font-display text-lg font-semibold text-foreground">Mensagem enviada</p>
            <p className="text-sm text-muted-foreground">Nossa equipe responde no seu e-mail <span className="font-semibold text-foreground">{sentTo}</span>.</p>
            <Button type="button" className="w-full rounded-full" onClick={() => reset(false)}>Fechar</Button>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {FAQ.map((item, i) => (
                <div key={item.q} className="rounded-2xl bg-foreground/5">
                  <button type="button" onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left font-body text-sm font-semibold text-foreground">
                    <span className="flex-1">{item.q}</span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", openFaq === i && "rotate-180")} />
                  </button>
                  {openFaq === i && <p className="px-4 pb-3 text-sm text-muted-foreground">{item.a}</p>}
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <p className="font-display text-base font-semibold text-foreground">Falar com a equipe</p>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((t) => (
                  <button key={t.id} type="button" onClick={() => setTopic(t.id)} aria-pressed={topic === t.id}
                    className={cn("rounded-full px-3.5 py-2 font-body text-xs font-semibold transition-colors",
                      topic === t.id ? "bg-primary text-primary-foreground" : "bg-foreground/5 text-foreground hover:bg-foreground/10")}>
                    {t.label}
                  </button>
                ))}
              </div>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 2000))} rows={4}
                placeholder="Conte o que aconteceu…" className="rounded-2xl font-body text-sm" />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button type="button" className="w-full rounded-full" disabled={!topic || message.trim().length < 5 || sending} onClick={send}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar mensagem"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">A resposta chega no e-mail da sua conta.</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
