import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackCtaClick, trackFaqOpen } from "@/lib/ga4";

const faqs = [
  {
    q: "Por que é tão mais barato que terapia?",
    a: "A Aura consegue oferecer acompanhamento emocional de qualidade a um custo muito menor porque está disponível 24/7 e escala com tecnologia. Não é terapia — é suporte emocional contínuo, com metodologia, memória do seu histórico e direção prática. É um complemento ou ponto de partida acessível para quem não pode pagar R$ 200 por sessão.",
  },
  {
    q: "A Aura substitui terapia com psicólogo?",
    a: "Aura é acompanhamento emocional e direção prática — não substitui atendimento psicológico profissional. Muita gente usa como complemento entre sessões ou como ponto de partida para quem não tem acesso à terapia. Se você está em crise severa, procure ajuda especializada.",
  },
  {
    q: "Como funciona o período de teste?",
    a: "Você experimenta a Aura por 7 dias com acesso completo ao plano escolhido, pagando apenas uma taxa simbólica (a partir de R$ 6,90). Se não fizer sentido, cancele a qualquer momento antes do 8º dia e não será cobrado mais nada. Se nos primeiros 7 dias você não sentir diferença, devolvemos seu dinheiro — sem perguntas.",
  },
  {
    q: "Posso pausar minha assinatura?",
    a: "Sim! Se você precisar dar um tempo, pode pausar sua assinatura por até 30 dias sem perder seu histórico ou progresso. Quando voltar, a Aura continua de onde parou.",
  },
  {
    q: "O que são as Sessões Especiais?",
    a: "São encontros de 45 minutos com metodologia estruturada (Investigação Socrática + Logoterapia). Você escolhe o tema: Clareza (decisões), Padrões (comportamentos repetitivos), Propósito (sentido de vida) ou Livre. Depois, recebe um resumo escrito com os principais insights.",
  },
  {
    q: "Posso enviar áudio?",
    a: "Sim! Você pode mandar áudio e também receber respostas em áudio. Fale do jeito que for mais natural pra você.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Sim. Seus dados são criptografados e usados apenas para a Aura lembrar do seu histórico e melhorar seu acompanhamento. Seguimos todas as normas da LGPD.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. No plano mensal você cancela quando quiser, sem fidelidade ou multa.",
  },
  {
    q: "O que é a Cápsula do Tempo?",
    a: "É um recurso exclusivo da Aura. Em momentos especiais da conversa, a Aura te convida a gravar um áudio para o seu eu do futuro. Você grava, confirma que ficou do jeito que queria, e a Aura guarda com carinho. Daqui a 3 meses, você recebe essa mensagem de volta — de surpresa. É poderoso se ouvir meses depois e perceber o quanto você evoluiu.",
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

        <div className="text-center mt-12">
          <Link
            to="/checkout"
            onClick={() => trackCtaClick("faq", "Começar por R$ 6,90 (v2)")}
          >
            <Button variant="sage" size="xl">
              Começar por R$ 6,90
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground mt-3">
            7 dias para experimentar • Cancele quando quiser
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default FAQV2;
