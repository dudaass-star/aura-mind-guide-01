import { Clock, Brain, Zap, Heart, Calendar, BarChart3, Mic } from "lucide-react";

const benefits = [
  {
    icon: Clock,
    title: "Disponível 24/7",
    description: "Quando bater ansiedade, pressão, raiva, insegurança ou confusão — você tem suporte na hora.",
    color: "bg-sage-soft",
    iconColor: "text-primary",
  },
  {
    icon: Brain,
    title: "Memória contínua",
    description: "Ela lembra do que você falou, das suas decisões, do que te derruba e do que te levanta.",
    color: "bg-lavender-soft",
    iconColor: "text-accent",
  },
  {
    icon: Zap,
    title: "Resposta imediata",
    description: "Sem esperar dias por 'um horário'. Clareza agora.",
    color: "bg-sky-soft",
    iconColor: "text-sky",
  },
  {
    icon: Heart,
    title: "Sem julgamento",
    description: "Você fala o que não consegue falar pra ninguém.",
    color: "bg-blush-soft",
    iconColor: "text-blush",
  },
  {
    icon: Calendar,
    title: "Check-in diário",
    description: "Acompanhamento do seu estado e consistência (sem te limitar a um 'tipo de problema').",
    color: "bg-sage-soft",
    iconColor: "text-primary",
  },
  {
    icon: BarChart3,
    title: "Review semanal",
    description: "Todo domingo: o que funcionou, o que te derrubou e o plano pra próxima semana.",
    color: "bg-lavender-soft",
    iconColor: "text-accent",
  },
  {
    icon: Mic,
    title: "Texto e áudio",
    description: "Você pode falar do seu jeito. AURA entende áudio e também pode responder em áudio.",
    color: "bg-sky-soft",
    iconColor: "text-sky",
  },
];

const Benefits = () => {
  return (
    <section className="py-24 bg-card relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Não é só conversar.{" "}
            <span className="text-gradient-sage">É acompanhamento emocional contínuo.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-background border border-border/50 hover:shadow-card hover:border-primary/20 transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-14 h-14 rounded-2xl ${benefit.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                  <benefit.icon className={`w-7 h-7 ${benefit.iconColor}`} />
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-foreground mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {benefit.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Benefits;