import { MessageSquare, Brain, Target, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: MessageSquare,
    title: "Você manda mensagem",
    description: "Texto ou áudio, do seu jeito.",
    color: "bg-sage-soft",
    iconColor: "text-primary",
  },
  {
    icon: Brain,
    title: "AURA entende seu contexto",
    description: "Ela lembra do seu histórico e te conhece de verdade.",
    color: "bg-lavender-soft",
    iconColor: "text-accent",
  },
  {
    icon: Target,
    title: "Você recebe direção",
    description: "Clareza + ação prática pro seu momento.",
    color: "bg-sky-soft",
    iconColor: "text-sky",
  },
  {
    icon: TrendingUp,
    title: "Você evolui com consistência",
    description: "Acompanhamento e progresso real.",
    color: "bg-blush-soft",
    iconColor: "text-blush",
  },
];

const HowItWorks = () => {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Simples como WhatsApp.{" "}
            <span className="text-gradient-sage">Profundo como uma conversa que resolve.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={index}
              className="group relative bg-card rounded-3xl p-8 border border-border/50 hover:shadow-card transition-all duration-500"
            >
              {/* Step number */}
              <div className="absolute -top-4 -left-2 w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold font-display">
                {index + 1}
              </div>

              {/* Icon */}
              <div className={`w-16 h-16 rounded-2xl ${step.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <step.icon className={`w-8 h-8 ${step.iconColor}`} />
              </div>

              {/* Content */}
              <h3 className="font-display text-xl font-bold text-foreground mb-3">
                {step.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;