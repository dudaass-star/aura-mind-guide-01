import { Clock, Wallet, Calendar, HelpCircle } from "lucide-react";

const painPoints = [
  {
    icon: Calendar,
    text: "Dificuldade de horários",
  },
  {
    icon: Wallet,
    text: "R$150-300 por sessão",
  },
  {
    icon: Clock,
    text: "Só 1 hora por semana",
  },
  {
    icon: HelpCircle,
    text: "E o resto do tempo?",
  },
];

const Problem = () => {
  return (
    <section className="py-24 bg-lavender-soft/30 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1/3 h-full bg-blush-soft/40 rounded-r-[100px] opacity-60" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
              A terapia tradicional é ótima.{" "}
              <span className="text-gradient-lavender">Mas nem todo mundo consegue pagar.</span>
            </h2>
            
            <p className="font-body text-lg md:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              R$600 a R$1.200 por mês. Agenda lotada. E quando a crise vem no meio da semana, 
              você se vira como dá.
            </p>
          </div>

          {/* Pain points grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            {painPoints.map((point, index) => (
              <div
                key={index}
                className="bg-card/80 backdrop-blur-sm rounded-2xl p-6 text-center border border-border/50"
              >
                <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                  <point.icon className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-foreground font-medium text-sm">{point.text}</p>
              </div>
            ))}
          </div>

          {/* Transition text */}
          <div className="text-center">
            <p className="font-display text-2xl md:text-3xl font-bold text-foreground">
              E se existisse outra forma?
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Problem;
