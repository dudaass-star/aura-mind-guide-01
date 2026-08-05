// Objeções respondidas no ponto de decisão (fecha o vazio abaixo do CTA no desktop).
// Fechadas por padrão: quem já decidiu não é interrompido; quem hesita resolve ali.
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const ITEMS = [
  {
    q: "Vou falar com um robô?",
    a: "Você conversa por WhatsApp com a AURA, que lembra do seu contexto, do que você já contou e acompanha sua evolução. Não é um chat genérico que começa do zero toda vez.",
  },
  {
    q: "Como eu cancelo?",
    a: "Em um clique no seu espaço, sem falar com ninguém e sem justificativa. E se cancelar dentro dos 7 dias de garantia, devolvemos o valor.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "As conversas são privadas e criptografadas, o pagamento é processado por Stripe e Asaas (nunca guardamos seu cartão) e usamos seu email só para recibo e recuperação de acesso.",
  },
];

export function CheckoutObjections({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="mb-2 text-center text-[11px] uppercase tracking-wide text-[hsl(var(--ck-text-muted))] lg:text-left">
        Dúvidas rápidas
      </p>
      <Accordion type="single" collapsible className="rounded-2xl border border-[hsl(var(--ck-line))] bg-[hsl(var(--ck-text)/0.04)] px-4">
        {ITEMS.map((it) => (
          <AccordionItem key={it.q} value={it.q} className="border-[hsl(var(--ck-line))] last:border-b-0">
            <AccordionTrigger className="py-3 text-left text-sm text-[hsl(var(--ck-text-soft))] hover:no-underline">
              {it.q}
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-[13px] leading-relaxed text-[hsl(var(--ck-text-muted))]">
              {it.a}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
