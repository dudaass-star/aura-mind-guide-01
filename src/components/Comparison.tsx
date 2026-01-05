import { Check, X } from "lucide-react";

const comparisonData = [
  {
    aspect: "Custo mensal",
    traditional: "R$600 - R$1.200",
    aura: "R$29,90 - R$79,90",
  },
  {
    aspect: "Disponibilidade",
    traditional: "1h por semana",
    aura: "24/7, quando precisar",
  },
  {
    aspect: "Espera inicial",
    traditional: "1-4 semanas",
    aura: "Imediato",
  },
  {
    aspect: "Memória entre sessões",
    traditional: "Depende do profissional",
    aura: "Automática e completa",
  },
  {
    aspect: "Resumo escrito",
    traditional: "Raro",
    aura: "Após cada sessão",
  },
  {
    aspect: "Resposta em crise",
    traditional: "Precisa agendar",
    aura: "Em segundos",
  },
];

const Comparison = () => {
  return (
    <section className="py-24 bg-background relative overflow-hidden">
      <div className="absolute top-1/2 left-0 w-1/3 h-96 bg-lavender-soft/30 rounded-r-full -translate-y-1/2 opacity-60" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="text-center mb-16">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Comparando com{" "}
            <span className="text-gradient-lavender">terapia tradicional</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transparência total sobre o que você está escolhendo.
          </p>
        </div>

        {/* Comparison table */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-card rounded-3xl border border-border/50 overflow-hidden shadow-card">
            {/* Header */}
            <div className="grid grid-cols-3 bg-muted/50">
              <div className="p-4 md:p-6">
                <span className="text-sm font-medium text-muted-foreground">Aspecto</span>
              </div>
              <div className="p-4 md:p-6 text-center border-l border-border/30">
                <span className="text-sm font-medium text-muted-foreground">Terapia Tradicional</span>
              </div>
              <div className="p-4 md:p-6 text-center border-l border-border/30 bg-sage-soft/30">
                <span className="text-sm font-medium text-primary">AURA</span>
              </div>
            </div>

            {/* Rows */}
            {comparisonData.map((row, index) => (
              <div
                key={index}
                className={`grid grid-cols-3 ${
                  index !== comparisonData.length - 1 ? "border-b border-border/30" : ""
                }`}
              >
                <div className="p-4 md:p-6 flex items-center">
                  <span className="text-sm text-foreground font-medium">{row.aspect}</span>
                </div>
                <div className="p-4 md:p-6 flex items-center justify-center border-l border-border/30">
                  <div className="flex items-center gap-2">
                    <X className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-muted-foreground">{row.traditional}</span>
                  </div>
                </div>
                <div className="p-4 md:p-6 flex items-center justify-center border-l border-border/30 bg-sage-soft/10">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-primary flex-shrink-0" />
                    <span className="text-sm text-foreground font-medium">{row.aura}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-8 max-w-2xl mx-auto">
          ⚠️ AURA é acompanhamento emocional e direção prática — não substitui atendimento psicológico profissional. 
          Se você está em crise severa, procure ajuda especializada.
        </p>
      </div>
    </section>
  );
};

export default Comparison;
