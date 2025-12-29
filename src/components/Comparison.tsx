import { Check, X } from "lucide-react";

const Comparison = () => {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-1/3 h-96 bg-lavender-soft/30 rounded-r-full -translate-y-1/2 opacity-60" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            AURA vs terapia tradicional{" "}
            <span className="text-gradient-lavender">(na prática do dia a dia)</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Terapia tradicional */}
          <div className="bg-card rounded-3xl p-8 border border-border/50">
            <h3 className="font-display text-2xl font-bold text-foreground mb-6 text-center">
              Terapia tradicional
            </h3>
            <ul className="space-y-4">
              {[
                "1 hora por semana",
                "Depende de agenda",
                "R$600/mês (1x/semana) ou R$1.200/mês (2x/semana)",
                "No restante do tempo, você se vira como dá",
              ].map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center mt-0.5">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* AURA */}
          <div className="bg-sage-soft/30 rounded-3xl p-8 border-2 border-primary/30 shadow-glow">
            <h3 className="font-display text-2xl font-bold text-foreground mb-6 text-center">
              AURA
            </h3>
            <ul className="space-y-4">
              {[
                "Acompanhamento no WhatsApp quando você precisa",
                "Sem agenda e sem espera",
                "Memória do seu histórico (continuidade real)",
                "R$27,90/mês ou R$239,90/ano",
              ].map((item, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center mt-0.5">
                    <Check className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-foreground font-medium">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
          AURA é acompanhamento emocional e direção prática — não é atendimento psicológico profissional.
        </p>
      </div>
    </section>
  );
};

export default Comparison;