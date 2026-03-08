import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  MessageCircle,
  Mic,
  Calendar,
  CalendarClock,
  Pause,
  FileText,
  BookOpen,
  BarChart3,
  Sparkles,
  Heart,
  ArrowRight,
  CheckCircle2,
  Clock,
  RefreshCw,
  Timer,
  RotateCcw,
  Gift,
  Bell,
  Eye,
  XCircle,
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
            <h3 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Sparkles size={18} className="text-primary" /> Temas que você pode trazer
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
                icon: Eye,
              },
              {
                name: "Padrões",
                desc: "Para entender comportamentos que se repetem",
                icon: RefreshCw,
              },
              {
                name: "Propósito",
                desc: "Para explorar sentido de vida e direção",
                icon: ArrowRight,
              },
              {
                name: "Livre",
                desc: "Para aprofundar qualquer tema que você quiser",
                icon: MessageCircle,
              },
            ].map((tipo) => (
              <Card
                key={tipo.name}
                className="border-border/50 bg-background hover:border-primary/30 transition-colors"
              >
                <CardContent className="p-5 text-center">
                  <div className="w-10 h-10 rounded-xl bg-sage-soft flex items-center justify-center mx-auto mb-2">
                    <tipo.icon className="w-5 h-5 text-primary" />
                  </div>
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
            <h3 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <BookOpen size={18} className="text-primary" /> Exemplos de jornadas
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

        {/* Relatório Semanal */}
        <Section
          id="relatorio"
          title="Relatório Semanal"
          subtitle="Acompanhe sua evolução com clareza"
          bg="bg-card"
        >
          <div className="bg-gradient-to-br from-sage-soft/40 via-background to-lavender-soft/30 rounded-2xl border border-primary/10 p-8 md:p-10">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="shrink-0 w-16 h-16 rounded-2xl bg-sage-soft flex items-center justify-center">
                <BarChart3 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-foreground mb-2">
                  Sua semana em perspectiva
                </h3>
                <p className="text-muted-foreground leading-relaxed mb-4">
                  Todo domingo às 19h, a AURA envia uma análise completa da sua semana: humor, temas discutidos, evolução emocional e próximos passos sugeridos. É como ter um espelho gentil que te ajuda a enxergar seus avanços.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Humor & energia", "Temas principais", "Evolução", "Próximos passos"].map((item) => (
                    <span key={item} className="px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Insights Proativos */}
        <Section
          id="insights"
          title="Insights Proativos"
          subtitle="A AURA enxerga o que você ainda não percebeu"
          bg="bg-background"
        >
          <div className="bg-gradient-to-br from-sage-soft/40 via-background to-lavender-soft/30 rounded-2xl border border-primary/10 p-8 md:p-10 mb-8">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="shrink-0 w-16 h-16 rounded-2xl bg-sage-soft flex items-center justify-center">
                <Eye className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-foreground mb-2">
                  Padrões que só quem acompanha de perto percebe
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Ao longo das semanas, a AURA observa conexões entre o que você vive e o que você sente. Quando percebe algo relevante, ela traz — sem você precisar perguntar. É como ter alguém que te conhece profundamente e diz: "Você já percebeu que...?"
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {[
              {
                icon: Sparkles,
                title: "Automático",
                desc: "A AURA identifica padrões e traz reflexões quando percebe algo importante — sem você pedir.",
                bg: "bg-sage-soft",
                iconColor: "text-primary",
              },
              {
                icon: BarChart3,
                title: "Correlações invisíveis",
                desc: "Descobre conexões que você não notou: entre certas situações e seu humor, ciclos emocionais recorrentes.",
                bg: "bg-lavender-soft",
                iconColor: "text-accent",
              },
              {
                icon: Heart,
                title: "No momento certo",
                desc: "Não enche de informações. Traz o insight quando ele pode fazer diferença na sua vida.",
                bg: "bg-blush-soft",
                iconColor: "text-blush",
              },
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/20 transition-colors text-center">
                <div className={`w-14 h-14 rounded-xl ${f.bg} flex items-center justify-center mx-auto mb-4`}>
                  <f.icon className={`w-7 h-7 ${f.iconColor}`} />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* Lembretes */}
        <Section
          id="lembretes"
          title="Lembretes"
          subtitle="Pede pra AURA lembrar e ela lembra — no horário exato"
          bg="bg-card"
        >
          <div className="grid md:grid-cols-3 gap-5 mb-8">
            {[
              {
                icon: Mic,
                title: "Por texto ou áudio",
                desc: 'Basta pedir naturalmente: "Me lembra de tomar o remédio" ou mande um áudio.',
                bg: "bg-sage-soft",
                iconColor: "text-primary",
              },
              {
                icon: Clock,
                title: "Horário exato",
                desc: '"Daqui a 10 minutos", "amanhã às 9h", "quinta às 14h" — a AURA calcula e agenda.',
                bg: "bg-lavender-soft",
                iconColor: "text-accent",
              },
              {
                icon: XCircle,
                title: "Cancela fácil",
                desc: 'Mudou de ideia? Diga "cancela meu lembrete" e pronto. Simples assim.',
                bg: "bg-sky-soft",
                iconColor: "text-sky",
              },
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl bg-background border border-border/50 hover:border-primary/20 transition-colors text-center">
                <div className={`w-14 h-14 rounded-xl ${f.bg} flex items-center justify-center mx-auto mb-4`}>
                  <f.icon className={`w-7 h-7 ${f.iconColor}`} />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-background rounded-2xl border border-border/50 p-6 mb-6">
            <h3 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <MessageCircle size={18} className="text-primary" /> Exemplo prático
            </h3>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <span className="shrink-0 font-semibold text-foreground">Você:</span>
                <span className="text-muted-foreground italic">"Me lembra daqui a 30 min de tomar o remédio"</span>
              </div>
              <div className="flex gap-3">
                <span className="shrink-0 font-semibold text-primary">AURA:</span>
                <span className="text-muted-foreground italic">"Anotado! Daqui a 30 minutinhos eu te aviso pra não esquecer. 💊"</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3 bg-sage-soft rounded-xl p-4 border border-primary/10">
            <Bell size={20} className="text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Tudo pelo WhatsApp</strong> — sem precisar instalar outro app ou abrir outra tela. A AURA te avisa ali mesmo, na conversa.
            </p>
          </div>
        </Section>

        {/* Meditações */}
        <section id="meditacoes" className="py-16 md:py-20 bg-background relative overflow-hidden">
          <div className="absolute top-10 right-10 w-72 h-72 bg-lavender-soft rounded-full blur-3xl opacity-30" />
          <div className="absolute bottom-10 left-10 w-64 h-64 bg-sage-soft rounded-full blur-3xl opacity-30" />

          <div className="container mx-auto px-4 max-w-4xl relative z-10">
            <div className="text-center mb-10">
              <span className="inline-block px-4 py-2 rounded-full bg-sage-soft text-primary text-sm font-medium mb-4">
                🧘 Tudo em um só lugar
              </span>
              <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-2">
                Meditações Personalizadas
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Sem precisar de outro app. A AURA envia meditações guiadas direto no WhatsApp, escolhidas para o que você está vivendo.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-5 mb-8">
              {[
                {
                  icon: Clock,
                  title: "Momento certo",
                  desc: "A AURA percebe quando você precisa e oferece uma meditação — sem você pedir.",
                  bg: "bg-sage-soft",
                  iconColor: "text-primary",
                },
                {
                  icon: Mic,
                  title: "Voz da AURA",
                  desc: "Áudios com a mesma voz que você já conhece. Familiar e acolhedor.",
                  bg: "bg-lavender-soft",
                  iconColor: "text-accent",
                },
                {
                  icon: MessageCircle,
                  title: "Direto no WhatsApp",
                  desc: "Sem abrir outro app. Você ouve ali mesmo, no meio da conversa.",
                  bg: "bg-sky-soft",
                  iconColor: "text-sky",
                },
              ].map((f, i) => (
                <div key={i} className="p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/20 transition-colors text-center">
                  <div className={`w-14 h-14 rounded-xl ${f.bg} flex items-center justify-center mx-auto mb-4`}>
                    <f.icon className={`w-7 h-7 ${f.iconColor}`} />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {["Ansiedade", "Sono", "Foco", "Estresse", "Gratidão", "Respiração"].map((tag) => (
                <span key={tag} className="px-3 py-1.5 rounded-full text-sm bg-card text-muted-foreground border border-border/50">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Cápsula do Tempo */}
        <Section
          id="capsula"
          title="Cápsula do Tempo"
          subtitle="Uma mensagem para o seu eu do futuro"
          bg="bg-background"
        >
          <div className="bg-gradient-to-br from-lavender-soft/40 via-background to-sage-soft/30 rounded-2xl border border-accent/10 p-8 md:p-10 mb-8">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="shrink-0 w-16 h-16 rounded-2xl bg-lavender-soft flex items-center justify-center">
                <Timer className="w-8 h-8 text-accent" />
              </div>
              <div>
                <h3 className="font-display text-xl font-bold text-foreground mb-2">
                  Como funciona
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Em momentos especiais da conversa, a AURA te convida a gravar um áudio para o seu eu do futuro. Você grava, confirma que ficou do jeito que queria, e a AURA guarda com carinho. Daqui a 3 meses, você recebe essa mensagem de volta — de surpresa.
                </p>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-8">
            {[
              {
                icon: Mic,
                title: "Grave quando quiser",
                desc: "A AURA propõe no momento certo, mas você decide se quer gravar ou não.",
                bg: "bg-sage-soft",
                iconColor: "text-primary",
              },
              {
                icon: RotateCcw,
                title: "Regrave quantas vezes precisar",
                desc: "Enviou errado? Sem problema. Mande outro áudio antes de confirmar.",
                bg: "bg-lavender-soft",
                iconColor: "text-accent",
              },
              {
                icon: Gift,
                title: "Receba de surpresa",
                desc: "3 meses depois, a AURA entrega sua cápsula. É poderoso se ouvir de novo.",
                bg: "bg-blush-soft",
                iconColor: "text-blush",
              },
            ].map((f, i) => (
              <div key={i} className="p-6 rounded-2xl bg-card border border-border/50 hover:border-accent/20 transition-colors text-center">
                <div className={`w-14 h-14 rounded-xl ${f.bg} flex items-center justify-center mx-auto mb-4`}>
                  <f.icon className={`w-7 h-7 ${f.iconColor}`} />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-3 bg-lavender-soft rounded-xl p-4 border border-lavender/20">
            <Heart size={20} className="text-accent shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              <strong className="text-foreground">Por que isso importa?</strong> Ouvir sua própria voz meses depois, falando sobre o que sentia naquele momento, é uma das formas mais profundas de perceber o quanto você evoluiu.
            </p>
          </div>
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
                  a: "A AURA é acompanhamento emocional contínuo — não substitui terapia profissional. Muitos usam como complemento entre sessões ou como primeiro passo acessível.",
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
              Quer experimentar tudo isso?
            </h2>
            <p className="text-muted-foreground mb-8 text-lg">
              5 conversas grátis. Sem cartão. Sem compromisso. 💜
            </p>
            <Button variant="sage" size="xl" asChild>
              <Link to="/experimentar">
                Começar Grátis
              </Link>
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
