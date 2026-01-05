import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "Por que é tão mais barato que terapia?",
    answer:
      "A AURA usa inteligência artificial avançada para oferecer acompanhamento emocional de qualidade a um custo muito menor. Não é terapia — é suporte emocional contínuo, com metodologia, memória do seu histórico e direção prática. É um complemento ou ponto de partida acessível para quem não pode pagar R$200 por sessão.",
  },
  {
    question: "A AURA substitui terapia com psicólogo?",
    answer:
      "AURA é acompanhamento emocional e direção prática — não substitui atendimento psicológico profissional. Muita gente usa como complemento entre sessões ou como ponto de partida para quem não tem acesso à terapia. Se você está em crise severa, procure ajuda especializada.",
  },
  {
    question: "Como funciona o teste grátis?",
    answer:
      "Você ganha 5 conversas grátis pra conhecer a AURA. Sem precisar de cartão de crédito. Se fizer sentido, você escolhe um plano pra continuar.",
  },
  {
    question: "Posso pausar minha assinatura?",
    answer:
      "Sim! Se você precisar dar um tempo, pode pausar sua assinatura por até 30 dias sem perder seu histórico ou progresso. Quando voltar, a AURA continua de onde parou.",
  },
  {
    question: "Como funciona a garantia de 7 dias?",
    answer:
      "Se nos primeiros 7 dias você não gostar da experiência, devolvemos 100% do valor. Sem burocracia, sem perguntas.",
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
