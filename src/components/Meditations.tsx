import { Clock, Mic, MessageCircle } from "lucide-react";

const features = [
  {
    icon: Clock,
    title: "Momento certo",
    description: "A AURA percebe quando você precisa e oferece uma meditação — sem você pedir.",
    color: "bg-sage-soft",
    iconColor: "text-primary",
  },
  {
    icon: Mic,
    title: "Voz da AURA",
    description: "Áudios com a mesma voz que você já conhece da conversa. Familiar e acolhedor.",
    color: "bg-lavender-soft",
    iconColor: "text-accent",
  },
  {
    icon: MessageCircle,
    title: "Direto no WhatsApp",
    description: "Sem abrir outro app. Você ouve ali mesmo, no meio da conversa.",
    color: "bg-sky-soft",
    iconColor: "text-sky",
  },
];

const Meditations = () => {
  return (
    <section className="py-24 bg-gradient-to-b from-card via-background to-background relative overflow-hidden">
      <div className="absolute top-10 right-10 w-72 h-72 bg-lavender-soft rounded-full blur-3xl opacity-30" />
      <div className="absolute bottom-10 left-10 w-64 h-64 bg-sage-soft rounded-full blur-3xl opacity-30" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16 animate-fade-up">
          <span className="inline-block px-4 py-2 rounded-full bg-sage-soft text-primary text-sm font-medium mb-4">
            🆕 Novo
          </span>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Meditações guiadas no{" "}
            <span className="text-gradient-sage">momento certo</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            A AURA percebe quando você precisa de uma pausa e envia uma meditação guiada personalizada direto no WhatsApp.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-12">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-card/80 backdrop-blur-sm border border-border/50 hover:shadow-card hover:border-primary/20 transition-all duration-300 text-center animate-fade-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`w-14 h-14 rounded-xl ${feature.color} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className={`w-7 h-7 ${feature.iconColor}`} />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground mb-2">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>

        <p className="text-center text-muted-foreground text-sm animate-fade-up delay-300">
          Ansiedade, sono, foco, estresse, gratidão… a AURA escolhe a meditação certa pra você.
        </p>
      </div>
    </section>
  );
};

export default Meditations;
