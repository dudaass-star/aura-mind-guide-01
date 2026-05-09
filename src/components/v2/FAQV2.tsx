import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackFaqOpen } from "@/lib/ga4";

const faqs = [
  {
    q: "Como funciona o trial de R$ 6,90?",
    a: "Você experimenta a Aura por 7 dias com acesso completo, pagando apenas uma taxa simbólica a partir de R$ 6,90. Se não fizer sentido, cancele antes do 8º dia e nada mais é cobrado.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Sem fidelidade, sem multa. Cancela direto pelo seu painel ou pelo WhatsApp.",
  },
  {
    q: "É terapia? Substitui psicólogo?",
    a: "Não. A Aura é acompanhamento emocional contínuo — pode complementar sua terapia ou ser um ponto de partida acessível, mas não substitui atendimento psicológico profissional.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Sim. Tudo criptografado, usado apenas para a Aura lembrar do seu histórico. Seguimos a LGPD.",
  },
];

const FAQV2 = () => (
  <section id="faq" className="relative py-28 md:py-36 bg-background">
    <div className="container mx-auto px-6">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm uppercase tracking-[0.25em] text-primary/80 mb-4 text-center">dúvidas</p>
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground text-center mb-16">
          O que costumam perguntar.
        </h2>

        <Accordion
          type="single"
          collapsible
          className="space-y-3"
          onValueChange={(v) => {
            if (!v) return;
            const idx = parseInt(v.replace("item-", ""), 10);
            const q = faqs[idx]?.q;
            if (q) trackFaqOpen(q);
          }}
        >
          {faqs.map((faq, i) => (
            <AccordionItem
              key={faq.q}
              value={`item-${i}`}
              className="border border-border/60 rounded-2xl px-6 bg-card/40"
            >
              <AccordionTrigger className="text-left font-display text-lg text-foreground py-5 hover:no-underline hover:text-primary">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  </section>
);

export default FAQV2;
