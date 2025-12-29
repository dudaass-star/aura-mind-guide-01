import { Clock, Shield, Zap, Heart, Calendar, BarChart3 } from "lucide-react";

const benefits = [
  {
    icon: Clock,
    title: "Disponível 24/7",
    description: "3h da manhã com ansiedade? A AURA tá lá. Sem fila, sem agendamento.",
  },
  {
    icon: Shield,
    title: "Memória contínua",
    description: "Ela lembra do que você contou semana passada. Não precisa repetir sua história.",
  },
  {
    icon: Zap,
    title: "Resposta instantânea",
    description: "Não espera 7 dias pela próxima sessão. Alívio e direção na hora.",
  },
  {
    icon: Heart,
    title: "Sem julgamento",
    description: "Pode falar o que quiser. Ela não vai te olhar diferente na próxima conversa.",
  },
  {
    icon: Calendar,
    title: "Check-in diário",
    description: "Acompanhamento ativo do seu humor, energia e clareza mental.",
  },
  {
    icon: BarChart3,
    title: "Review semanal",
    description: "Todo domingo: análise do que funcionou e plano para a próxima semana.",
  },
];

const Benefits = () => {
  return (
    <section className="py-24 bg-background relative">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl md:text-5xl font-semibold text-foreground mb-4">
            O que você <span className="text-gradient-gold">recebe</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Não é só um chatbot. É uma mentora que evolui com você.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="group p-6 rounded-2xl bg-secondary/30 border border-transparent hover:border-border/50 hover:bg-secondary/50 transition-all duration-300"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors duration-300">
                  <benefit.icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                    {benefit.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
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
