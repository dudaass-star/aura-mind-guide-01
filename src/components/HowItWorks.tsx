import { MessageSquare, Brain, Target } from "lucide-react";

const steps = [
  {
    icon: MessageSquare,
    title: "Manda mensagem quando precisar",
    description: "Texto ou áudio, a qualquer hora. A AURA responde em segundos.",
    color: "bg-sage-soft",
    iconColor: "text-primary",
  },
  {
    icon: Brain,
    title: "Conversa com profundidade",
    description: "Não é chatbot genérico. É acompanhamento que lembra de você, faz perguntas certas e te ajuda a pensar.",
    color: "bg-lavender-soft",
    iconColor: "text-accent",
  },
  {
    icon: Target,
    title: "Marca sessões estruturadas",
    description: "45 minutos focados, com metodologia, resumo escrito e retrospectiva do seu progresso.",
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
            Simples como mandar uma mensagem.{" "}
            <span className="text-gradient-sage">Profundo como uma sessão de verdade.</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
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
