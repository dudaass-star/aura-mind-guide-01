import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { trackFaqOpen } from "@/lib/ga4";

const faqs = [
  {
    q: "O que é a AURA e como ela funciona?",
    a: "A AURA é uma inteligência de acompanhamento emocional pelo WhatsApp. Você conversa por texto ou áudio sobre o que está vivendo. Ela faz perguntas, conecta acontecimentos e ajuda a transformar o que está confuso em clareza e direção. Quando quiser aprofundar um tema, há encontros guiados de 45 minutos com fechamento e resumo escrito.",
  },
  {
    q: "Como é a primeira conversa?",
    a: "Simples: você manda uma mensagem contando o que está sentindo, do jeito que sair. A AURA não aplica formulário nem entrega respostas prontas — ela pergunta, escuta e ajuda você a organizar o que está embaralhado. Nos primeiros dias ela vai mapeando sua vida concreta, e daí em diante cada conversa fica mais precisa, porque ela já sabe quem é quem na sua história.",
  },
  {
    q: "O que a AURA constrói ao longo do tempo?",
    a: "As conversas não ficam soltas. A AURA transforma o percurso em capítulos mensais com temas, mudanças percebidas, marcos e trechos das suas próprias palavras. Você também encontra resumos dos encontros, insights e experiências ligadas ao seu momento no seu espaço pessoal.",
  },
  {
    q: "A AURA substitui atendimento psicológico?",
    a: "A AURA é uma experiência própria de acompanhamento emocional, clareza e direção prática. Ela não realiza diagnóstico nem substitui atendimento psicológico profissional. Se você estiver em risco imediato ou em uma emergência, procure ajuda especializada.",
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
    q: "O que são os encontros guiados?",
    a: "São 45 minutos dedicados a aprofundar um tema importante com método e continuidade. A AURA investiga com você, ajuda a construir uma nova perspectiva e encerra com um fechamento coerente com aquele momento. Depois, o encontro fica registrado com resumo escrito no seu espaço pessoal.",
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

const FAQV3 = () => (
  <section id="faq" className="relative py-28 md:py-36 bg-background">
    <div className="container mx-auto px-6">
      <div className="max-w-2xl mx-auto">
        <p className="text-sm uppercase tracking-[0.25em] text-primary/80 mb-4 text-center">antes de começar</p>
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground text-center mb-16">
          O que costumam perguntar.
        </h2>

        <Accordion
          type="single"
          collapsible
          defaultValue="item-0"
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

export default FAQV3;
