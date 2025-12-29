import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "A AURA substitui terapia?",
    answer:
      "Não. A AURA é uma mentora de alta performance emocional, não uma psicóloga. Ela te ajuda com clareza mental, direção e consistência no dia a dia. Para questões clínicas graves, sempre recomendamos acompanhamento profissional.",
  },
  {
    question: "Como funciona o teste grátis?",
    answer:
      "Você ganha 5 conversas grátis para experimentar a AURA. Cada mensagem que gera uma resposta conta como 1 conversa. O onboarding inicial não consome créditos.",
  },
  {
    question: "Meus dados ficam seguros?",
    answer:
      "Sim. Suas conversas são criptografadas e armazenadas de forma segura. Não compartilhamos seus dados com terceiros. Você pode pedir a exclusão a qualquer momento.",
  },
  {
    question: "Posso cancelar quando quiser?",
    answer:
      "Claro. No plano mensal, você pode cancelar a qualquer momento e não será cobrado no próximo mês. No plano anual, não há reembolso, mas você mantém acesso até o fim do período.",
  },
  {
    question: "Como a AURA lembra das coisas?",
    answer:
      "A AURA mantém um 'dossiê' sobre você: seus problemas, vitórias, padrões de comportamento e objetivos. Quanto mais você conversa, mais ela te conhece e mais precisa fica.",
  },
  {
    question: "Posso enviar áudio?",
    answer:
      "Sim! Você pode enviar áudio e a AURA vai transcrever e responder. Para receber respostas em áudio, basta pedir ou mandar um áudio primeiro. Há uma quota diária de áudios (2 no mensal, 3 no anual).",
  },
  {
    question: "Qual a diferença pro ChatGPT?",
    answer:
      "O ChatGPT não lembra de você entre conversas. A AURA foi treinada especificamente para mentoria emocional com Estoicismo e Logoterapia, mantém memória contínua, faz check-ins diários e acompanha seu progresso.",
  },
];

const FAQ = () => {
  return (
    <section id="faq" className="py-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Perguntas <span className="text-gradient-gold">frequentes</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Tire suas dúvidas antes de começar.
          </p>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="bg-secondary/30 rounded-xl border border-border/50 px-6 data-[state=open]:bg-secondary/50 transition-colors duration-300"
              >
                <AccordionTrigger className="text-left font-display text-lg font-medium text-foreground hover:text-primary py-5 hover:no-underline">
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
