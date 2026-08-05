// Objeções respondidas no ponto de decisão (fecha o vazio abaixo do CTA no desktop).
// Fechadas por padrão: quem já decidiu não é interrompido; quem hesita resolve ali.
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const ITEMS: { q: string; a: string[] }[] = [
  {
    q: "O que muda em ter a AURA no seu WhatsApp?",
    a: [
      "Ela lembra da sua história, entende seu momento, acompanha sua evolução e está disponível exatamente quando você precisa conversar, refletir, aliviar a pressão ou encontrar clareza para tomar decisões. 6h da manhã, meia-noite, no meio do dia — sem agenda, sem sala de espera, sem esperar até terça.",
      "Diferente de uma conversa isolada, a AURA constrói uma relação contínua. Cada interação faz com que ela compreenda melhor seus objetivos, desafios, gatilhos, hábitos e sua forma de pensar — o acompanhamento fica cada vez mais personalizado. Você nunca precisa começar do zero.",
    ],
  },
  {
    q: "Como é a primeira conversa?",
    a: [
      "Ela começa pelo que está pesando agora. Você responde por texto ou áudio, do jeito que for mais fácil. Nos primeiros minutos já dá pra sentir a diferença: em vez de conselho pronto, você sai com uma leitura do que está acontecendo e um próximo passo concreto pra hoje.",
      "E é dali que ela começa a te conhecer. O que você contar hoje continua valendo amanhã, na semana que vem e nos próximos meses.",
    ],
  },
  {
    q: "E se eu não gostar?",
    a: [
      "Você não está assinando um compromisso, está começando uma conversa. Cancela em um clique no seu espaço, sem falar com ninguém e sem justificar nada. Dentro dos 7 dias de garantia, devolvemos o valor.",
    ],
  },
  {
    q: "Posso falar o que eu não falo pra ninguém?",
    a: [
      "É exatamente pra isso. Sem julgamento, sem alguém da sua vida sabendo. As conversas são privadas e criptografadas, o pagamento é processado por Stripe e Asaas (nunca guardamos seu cartão) e seu email é usado só para recibo e recuperação de acesso.",
    ],
  },
];

export function CheckoutObjections({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="text-center text-[11px] uppercase tracking-wide text-[hsl(var(--ck-text-muted))] lg:text-left">
        Antes de começar
      </p>
      <p className="mb-3 mt-1 text-center text-[13px] leading-relaxed text-[hsl(var(--ck-text-soft))] lg:text-left">
        Em poucos minutos você já está conversando. Veja como funciona na prática.
      </p>
      <Accordion
        type="single"
        collapsible
        defaultValue={ITEMS[0].q}
        className="rounded-2xl border border-[hsl(var(--ck-line))] bg-[hsl(var(--ck-text)/0.04)] px-4"
      >
        {ITEMS.map((it) => (
          <AccordionItem key={it.q} value={it.q} className="border-[hsl(var(--ck-line))] last:border-b-0">
            <AccordionTrigger className="py-3 text-left text-sm text-[hsl(var(--ck-text-soft))] hover:no-underline">
              {it.q}
            </AccordionTrigger>
            <AccordionContent className="space-y-2.5 pb-4 text-[13px] leading-relaxed text-[hsl(var(--ck-text-muted))]">
              {it.a.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
