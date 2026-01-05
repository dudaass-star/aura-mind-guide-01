import { Clock, Brain, Calendar, FileText, Heart, PauseCircle, TrendingUp, Mic } from "lucide-react";

const benefits = [
  {
    icon: Clock,
    title: "Disponível 24/7",
    description: "3h da manhã e a ansiedade bateu? A AURA tá lá.",
    color: "bg-sage-soft",
    iconColor: "text-primary",
  },
  {
    icon: Brain,
    title: "Memória de longo prazo",
    description: "Lembra do que você contou semanas atrás.",
    color: "bg-lavender-soft",
    iconColor: "text-accent",
  },
  {
    icon: Calendar,
    title: "Sessões Especiais de 45min",
    description: "Metodologia estruturada, não papo aleatório.",
    color: "bg-sky-soft",
    iconColor: "text-sky",
  },
  {
    icon: FileText,
    title: "Resumo escrito",
    description: "Depois de cada sessão, recebe os insights por escrito.",
    color: "bg-blush-soft",
    iconColor: "text-blush",
  },
  {
    icon: Heart,
    title: "Nunca te abandona",
    description: "Se você sumir, a AURA vai atrás pra saber como você tá.",
    color: "bg-sage-soft",
    iconColor: "text-primary",
  },
  {
    icon: PauseCircle,
    title: "Pausa quando precisar",
    description: "Pausou a vida? Pausa a assinatura por 30 dias.",
    color: "bg-lavender-soft",
    iconColor: "text-accent",
  },
  {
    icon: TrendingUp,
    title: "Retrospectiva de progresso",
    description: "A cada 4 sessões, uma visão do seu crescimento.",
    color: "bg-sky-soft",
    iconColor: "text-sky",
  },
  {
    icon: Mic,
    title: "Texto e áudio",
    description: "Fala do jeito que for mais fácil pra você.",
    color: "bg-blush-soft",
    iconColor: "text-blush",
  },
];

const Benefits = () => {
  return (
    <section className="py-24 bg-card relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-2 rounded-full bg-sage-soft text-primary text-sm font-medium mb-4">
            ✨ Tudo isso
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Por menos de{" "}
            <span className="text-gradient-sage">R$2 por dia</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Saúde mental acessível não é saúde mental inferior. É saúde mental para todos.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-background border border-border/50 hover:shadow-card hover:border-primary/20 transition-all duration-300"
            >
              <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${benefit.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <benefit.icon className={`w-6 h-6 ${benefit.iconColor}`} />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground mb-2">
                {benefit.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {benefit.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;
