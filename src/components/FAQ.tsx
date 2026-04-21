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
    question: "Por que é tão mais barato que terapia?",
    answer:
      "A AURA consegue oferecer acompanhamento emocional de qualidade a um custo muito menor porque está disponível 24/7 e escala com tecnologia. Não é terapia — é suporte emocional contínuo, com metodologia, memória do seu histórico e direção prática. É um complemento ou ponto de partida acessível para quem não pode pagar R$200 por sessão.",
  },
  {
    question: "A AURA substitui terapia com psicólogo?",
    answer:
      "AURA é acompanhamento emocional e direção prática — não substitui atendimento psicológico profissional. Muita gente usa como complemento entre sessões ou como ponto de partida para quem não tem acesso à terapia. Se você está em crise severa, procure ajuda especializada.",
  },
  {
    question: "Como funciona o período de teste?",
    answer:
      "Você experimenta a AURA por 7 dias com acesso completo ao plano escolhido, pagando apenas uma taxa simbólica (a partir de R$ 6,90). Se não fizer sentido, cancele a qualquer momento antes do 8º dia e não será cobrado mais nada. Se nos primeiros 7 dias você não sentir diferença, devolvemos seu dinheiro — sem perguntas.",
  },
  {
    question: "Posso pausar minha assinatura?",
    answer:
      "Sim! Se você precisar dar um tempo, pode pausar sua assinatura por até 30 dias sem perder seu histórico ou progresso. Quando voltar, a AURA continua de onde parou.",
  },
  {
    question: "O que são as Sessões Especiais?",
    answer:
      "São encontros de 45 minutos com metodologia estruturada (Investigação Socrática + Logoterapia). Você escolhe o tema: Clareza (decisões), Padrões (comportamentos repetitivos), Propósito (sentido de vida) ou Livre. Depois, recebe um resumo escrito com os principais insights.",
  },
  {
    question: "Posso enviar áudio?",
    answer:
      "Sim! Você pode mandar áudio e também receber respostas em áudio. Fale do jeito que for mais natural pra você.",
  },
  {
    question: "Meus dados ficam seguros?",
    answer:
      "Sim. Seus dados são criptografados e usados apenas para a AURA lembrar do seu histórico e melhorar seu acompanhamento. Seguimos todas as normas da LGPD.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Sim. No plano mensal você cancela quando quiser, sem fidelidade ou multa.",
  },
  {
    question: "O que é a Cápsula do Tempo?",
    answer:
      "É um recurso exclusivo da AURA. Em momentos especiais da conversa, a AURA te convida a gravar um áudio para o seu eu do futuro. Você grava, confirma que ficou do jeito que queria, e a AURA guarda com carinho. Daqui a 3 meses, você recebe essa mensagem de volta — de surpresa. É poderoso se ouvir meses depois e perceber o quanto você evoluiu.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Perguntas <span className="text-gradient-sage">frequentes</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Tire suas dúvidas sobre a AURA
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion
            type="single"
            collapsible
            className="space-y-4"
            onValueChange={(value) => {
              if (!value) return;
              const idx = parseInt(value.replace("item-", ""), 10);
              const q = faqs[idx]?.question;
              if (q) trackFaqOpen(q);
            }}
          >
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-card rounded-2xl border border-border/50 px-6 data-[state=open]:bg-sage-soft/20 transition-colors duration-300"
              >
                <AccordionTrigger className="text-left font-display text-lg font-semibold text-foreground hover:text-primary py-5 hover:no-underline">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="text-center mt-12">
            <Link to="/checkout" onClick={() => trackCtaClick("faq", "Começar por R$ 6,90")}>
              <Button variant="sage" size="xl">
                Começar por R$ 6,90
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground mt-2">
              7 dias para experimentar • Cancele quando quiser
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
