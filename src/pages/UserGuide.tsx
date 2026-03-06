import { Helmet } from "react-helmet-async";
import {
  MessageCircle,
  Mic,
  Calendar,
  CalendarClock,
  Pause,
  FileText,
  BookOpen,
  BarChart3,
  SmilePlus,
  Music,
  Sparkles,
  Heart,
  ArrowRight,
  CheckCircle2,
  Clock,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const UserGuide = () => {
  return (
    <>
      <Helmet>
        <title>Guia da AURA — Como Aproveitar ao Máximo</title>
        <meta
          name="description"
          content="Guia completo de como usar a AURA: conversas, sessões, jornadas, meditações e mais."
        />
      </Helmet>

      <div className="min-h-screen bg-background font-body">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-sage-soft via-background to-lavender-soft py-16 md:py-24">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <img
              src="/favicon.png"
              alt="AURA"
              className="mx-auto mb-6 h-16 w-16 rounded-2xl"
            />
            <h1 className="font-display text-3xl md:text-5xl font-bold text-foreground mb-4">
              Seu Guia da <span className="text-primary">AURA</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              Tudo o que você precisa saber para ter a melhor experiência possível com a sua companheira emocional.
            </p>
          </div>
        </section>

        {/* Como Conversar */}
        <Section
          id="conversas"
          title="Como conversar com a AURA"
          subtitle="Sua companheira está disponível 24/7 pelo WhatsApp"
          bg="bg-background"
        >
          <div className="grid md:grid-cols-2 gap-6">
            <FeatureCard
              icon={<MessageCircle className="text-primary" />}
              title="Por texto"
              description="Escreva o que quiser, do jeito que for mais natural. Pode ser uma frase curta ou um desabafo longo — a AURA lê tudo com atenção."
            />
            <FeatureCard
              icon={<Mic className="text-primary" />}
              title="Por áudio"
              description="Prefere falar? Mande áudio! A AURA entende e pode responder em áudio também. É como conversar com uma amiga de verdade."
            />
          </div>
          <div className="mt-8 bg-card rounded-2xl border border-border/50 p-6">
            <h3 className="font-display text-lg font-semibold text-foreground mb-3">
              💡 Temas que você pode trazer
            </h3>
            <div className="grid sm:grid-cols-2 gap-2">
              {[
                "Ansiedade e preocupações",
                "Relacionamentos",
                "Autoestima e autoconfiança",
                "Decisões difíceis",
                "Estresse no trabalho",
                "Propósito e sentido de vida",
                "Padrões de comportamento",
                "Solidão e isolamento",
              ].map((tema) => (
                <div key={tema} className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 size={16} className="text-primary shrink-0" />
                  <span>{tema}</span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Sessões Especiais */}
        <Section
          id="sessoes"
          title="Sessões Especiais"
          subtitle="Encontros estruturados de 45 minutos com metodologia profunda"
          bg="bg-card"
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[
              {
                name: "Clareza",
                desc: "Para decisões difíceis e momentos de dúvida",
                emoji: "🔍",
              },
              {
                name: "Padrões",
                desc: "Para entender comportamentos que se repetem",
                emoji: "🔄",
              },
              {
                name: "Propósito",
                desc: "Para explorar sentido de vida e direção",
                emoji: "🧭",
              },
              {
                name: "Livre",
                desc: "Para aprofundar qualquer tema que você quiser",
                emoji: "💬",
              },
            ].map((tipo) => (
              <Card
                key={tipo.name}
                className="border-border/50 bg-background hover:border-primary/30 transition-colors"
              >
                <CardContent className="p-5 text-center">
                  <span className="text-3xl mb-2 block">{tipo.emoji}</span>
                  <h4 className="font-display font-semibold text-foreground mb-1">
                    {tipo.name}
                  </h4>
                  <p className="text-sm text-muted-foreground">{tipo.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <FeatureCard
              icon={<Calendar className="text-primary" />}
              title="Como agendar"
              description='Basta dizer à AURA: "Quero agendar uma sessão de Clareza para quinta às 20h". Ela cuida do resto.'
            />
            <FeatureCard
              icon={<CalendarClock className="text-primary" />}
              title="Trocar data/horário"
              description='Precisa reagendar? Diga: "AURA, muda minha sessão para sexta às 19h" e pronto.'
            />
            <FeatureCard
              icon={<Pause className="text-primary" />}
              title="Pausar sessões"
              description='Vai viajar ou precisa de um tempo? Peça: "Pausa minhas sessões por 2 semanas". Quando voltar, é só avisar.'
            />
          </div>

          <div className="mt-6 flex items-start gap-3 bg-lavender-soft rounded-xl p-4 border border-lavender/20">
            <FileText size={20} className="text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Após cada sessão</strong>, você recebe
              um resumo escrito com os principais insights e compromissos definidos durante
              a conversa.
            </p>
          </div>
        </Section>

        {/* Jornadas */}
        <Section
          id="jornadas"
          title="Jornadas de Conteúdo"
          subtitle="Episódios semanais personalizados para sua evolução"
          bg="bg-background"
        >
          <div className="grid md:grid-cols-2 gap-6">
            <FeatureCard
              icon={<BookOpen className="text-primary" />}
              title="Episódios toda terça e sexta"
              description="Você recebe conteúdos aprofundados sobre temas como autoconfiança, gestão emocional, relacionamentos e mais — tudo adaptado ao seu momento."
            />
            <FeatureCard
              icon={<ArrowRight className="text-primary" />}
              title="Progressão automática"
              description="Ao terminar uma jornada, a AURA sugere a próxima com base no que vocês conversaram. Sua evolução é contínua."
            />
          </div>
          <div className="mt-6 bg-card rounded-2xl border border-border/50 p-6">
            <h3 className="font-display text-lg font-semibold text-foreground mb-3">
              📚 Exemplos de jornadas
            </h3>
            <div className="flex flex-wrap gap-2">
              {[
                "Autoconfiança",
                "Gestão da Ansiedade",
                "Inteligência Emocional",
                "Propósito de Vida",
                "Relacionamentos Saudáveis",
              ].map((j) => (
                <span
                  key={j}
                  className="px-3 py-1.5 rounded-full text-sm bg-sage-soft text-foreground border border-primary/10"
                >
                  {j}
                </span>
              ))}
            </div>
          </div>
        </Section>

        {/* Relatório + Check-in */}
        <Section
          id="relatorio"
          title="Relatório Semanal & Check-in"
          subtitle="Acompanhe sua evolução com clareza"
          bg="bg-card"
        >
          <div className="grid md:grid-cols-2 gap-6">
            <FeatureCard
              icon={<BarChart3 className="text-primary" />}
              title="Relatório Semanal"
              description="Todo domingo às 19h você recebe uma análise da sua semana: humor, temas discutidos, evolução e próximos passos sugeridos."
            />
            <FeatureCard
              icon={<SmilePlus className="text-primary" />}
              title="Check-in de Humor"
              description="Toda segunda a AURA faz um check-in rápido: como você está, seu nível de energia e humor. Isso ajuda a personalizar seu acompanhamento."
            />
          </div>
        </Section>

        {/* Meditações */}
        <Section
          id="meditacoes"
          title="Meditações Personalizadas"
          subtitle="Áudios de meditação escolhidos para o seu momento"
          bg="bg-background"
        >
          <FeatureCard
            icon={<Music className="text-primary" />}
            title="Meditações sob medida"
            description="A AURA escolhe meditações com base no que vocês estão conversando. Pode ser para ansiedade, sono, foco ou qualquer tema que faça sentido pra você naquele momento."
          />
        </Section>

        {/* Dicas */}
        <Section
          id="dicas"
          title="Dicas para a Melhor Experiência"
          subtitle="Pequenos hábitos que fazem toda a diferença"
          bg="bg-card"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon: <Heart size={20} className="text-primary" />,
                title: "Seja honesto(a)",
                desc: "Quanto mais real você for, mais a AURA consegue te ajudar de verdade.",
              },
              {
                icon: <RefreshCw size={20} className="text-primary" />,
                title: "Mantenha constância",
                desc: "Conversar regularmente — mesmo que pouco — faz diferença enorme no longo prazo.",
              },
              {
                icon: <Mic size={20} className="text-primary" />,
                title: "Use áudio quando preferir",
                desc: "Às vezes é mais fácil falar do que escrever. A AURA entende perfeitamente.",
              },
              {
                icon: <Sparkles size={20} className="text-primary" />,
                title: "Peça ajuda específica",
                desc: 'Diga coisas como "Me ajuda a entender por que eu reajo assim" — quanto mais claro, melhor.',
              },
            ].map((dica) => (
              <div
                key={dica.title}
                className="flex gap-4 bg-background rounded-xl p-5 border border-border/50"
              >
                <div className="shrink-0 mt-0.5">{dica.icon}</div>
                <div>
                  <h4 className="font-display font-semibold text-foreground mb-1">
                    {dica.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">{dica.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* FAQ */}
        <Section
          id="faq"
          title="Perguntas Rápidas"
          subtitle="Respostas para dúvidas comuns"
          bg="bg-background"
        >
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-3">
              {[
                {
                  q: "Posso pausar minha assinatura?",
                  a: "Sim! Você pode pausar por até 30 dias sem perder seu histórico. Quando voltar, a AURA continua de onde parou.",
                },
                {
                  q: "Como cancelo minha assinatura?",
                  a: "Você pode cancelar a qualquer momento, sem multa. Basta acessar o link de cancelamento enviado por email ou falar com a AURA.",
                },
                {
                  q: "Meus dados ficam seguros?",
                  a: "Sim. Todos os dados são criptografados e usados apenas para personalizar seu acompanhamento. Seguimos a LGPD.",
                },
                {
                  q: "Posso trocar de plano?",
                  a: "Sim! Você pode fazer upgrade ou downgrade a qualquer momento. As mudanças entram em vigor no próximo ciclo de cobrança.",
                },
                {
                  q: "A AURA substitui terapia?",
                  a: "A AURA é acompanhamento emocional com IA — não substitui terapia profissional. Muitos usam como complemento entre sessões ou como primeiro passo acessível.",
                },
              ].map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-card rounded-2xl border border-border/50 px-6 data-[state=open]:bg-sage-soft/20 transition-colors"
                >
                  <AccordionTrigger className="text-left font-display text-base font-semibold text-foreground hover:text-primary py-4 hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pb-4 leading-relaxed">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </Section>

        {/* CTA */}
        <section className="py-16 md:py-24 bg-gradient-to-br from-sage-soft via-background to-lavender-soft">
          <div className="container mx-auto px-4 text-center max-w-xl">
            <h2 className="font-display text-2xl md:text-4xl font-bold text-foreground mb-4">
              Pronta para começar?
            </h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Volte ao WhatsApp e diga oi pra AURA. Ela tá te esperando. 💜
            </p>
            <Button variant="whatsapp" size="xl" asChild>
              <a
                href="https://wa.me/5511999999999"
                target="_blank"
                rel="noopener noreferrer"
              >
                <MessageCircle size={20} />
                Abrir WhatsApp
              </a>
            </Button>
          </div>
        </section>

        {/* Footer mínimo */}
        <footer className="py-6 bg-background border-t border-border/50 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} AURA — Sua companheira emocional
          </p>
        </footer>
      </div>
    </>
  );
};

/* ---- Sub-components ---- */

const Section = ({
  id,
  title,
  subtitle,
  bg,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  bg: string;
  children: React.ReactNode;
}) => (
  <section id={id} className={`py-16 md:py-20 ${bg}`}>
    <div className="container mx-auto px-4 max-w-4xl">
      <div className="text-center mb-10">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-2">
          {title}
        </h2>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  </section>
);

const FeatureCard = ({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) => (
  <Card className="border-border/50 bg-card hover:border-primary/20 transition-colors">
    <CardContent className="p-6 flex gap-4">
      <div className="shrink-0 mt-1">{icon}</div>
      <div>
        <h3 className="font-display font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
    </CardContent>
  </Card>
);

export default UserGuide;
