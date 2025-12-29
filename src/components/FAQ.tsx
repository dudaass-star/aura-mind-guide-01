import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "A AURA substitui terapia com psicólogo?",
    answer:
      "AURA é acompanhamento emocional e direção prática. Muita gente usa como complemento entre sessões. Se você faz terapia, a AURA ajuda a manter clareza e consistência no dia a dia.",
  },
  {
    question: "Como funciona o teste grátis?",
    answer:
      "Você ganha 5 conversas grátis. Quando acabar, você escolhe um plano pra continuar.",
  },
  {
    question: "Quais temas a AURA atende?",
    answer:
      "Trabalho, relacionamento, autoestima, família, decisões difíceis, hábitos, foco, ansiedade, tristeza, propósito… Você traz o tema. AURA conduz.",
  },
  {
    question: "Posso enviar áudio?",
    answer:
      "Sim. Você pode mandar áudio e também receber respostas em áudio.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "No plano mensal, sim — você cancela quando quiser.",
  },
  {
    question: "Meus dados ficam seguros?",
    answer:
      "Seus dados são usados para a AURA lembrar do seu histórico e melhorar o acompanhamento. Temos políticas de privacidade em conformidade com a LGPD.",
  },
  {
    question: "Qual a diferença para um chatbot comum?",
    answer:
      "AURA foi desenhada pra acompanhamento contínuo: memória do seu caso + direção prática + check-in + review semanal.",
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
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
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
        </div>
      </div>
    </section>
  );
};

export default FAQ;