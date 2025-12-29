import { MessageSquare, Brain, Target, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: MessageSquare,
    title: "Converse naturalmente",
    description: "Mande mensagem como falaria com uma amiga. Texto ou áudio, sem formulários chatos.",
  },
  {
    icon: Brain,
    title: "AURA te entende",
    description: "Ela lembra de tudo: seus problemas, vitórias, padrões. Quanto mais conversa, mais te conhece.",
  },
  {
    icon: Target,
    title: "Receba direção",
    description: "Micro-ações práticas de 2 minutos. Nada de conselho genérico — é pra sua vida real.",
  },
  {
    icon: TrendingUp,
    title: "Evolua com consistência",
    description: "Check-ins diários, review semanal e acompanhamento do seu progresso emocional.",
  },
];

const HowItWorks = () => {
  return (
    <section className="py-24 bg-card relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-glow opacity-30" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl md:text-5xl font-semibold text-foreground mb-4">
            Como a <span className="text-gradient-gold">AURA</span> funciona
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Simples como mandar mensagem. Profundo como uma mentoria de verdade.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={index}
              className="group relative bg-gradient-card rounded-2xl p-6 border border-border/50 hover:border-primary/30 transition-all duration-500 hover:shadow-glow"
            >
              {/* Step number */}
              <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-semibold">
                {index + 1}
              </div>

              {/* Icon */}
              <div className="w-14 h-14 rounded-xl bg-secondary/50 flex items-center justify-center mb-5 group-hover:bg-primary/10 transition-colors duration-300">
                <step.icon className="w-7 h-7 text-primary" />
              </div>

              {/* Content */}
              <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                {step.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {step.description}
              </p>

              {/* Connector line (except last) */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 -right-3 w-6 h-[2px] bg-border" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
