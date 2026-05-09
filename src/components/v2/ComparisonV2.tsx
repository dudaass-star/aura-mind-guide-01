import { Check, X } from "lucide-react";

const rows = [
  { aspect: "Custo mensal", traditional: "R$600 – R$1.200", aura: "R$29,90 – R$79,90" },
  { aspect: "Disponibilidade", traditional: "1h por semana", aura: "24/7, quando precisar" },
  { aspect: "Espera inicial", traditional: "1–4 semanas", aura: "Imediato" },
  { aspect: "Memória entre conversas", traditional: "Depende", aura: "Automática e completa" },
  { aspect: "Resposta em crise", traditional: "Precisa agendar", aura: "Em segundos" },
];

const ComparisonV2 = () => (
  <section className="relative py-28 md:py-36 bg-background overflow-hidden">
    <div className="container mx-auto px-6 relative z-10">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <p className="text-sm uppercase tracking-[0.25em] text-primary/80 mb-4">comparação</p>
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground">
          Não é terapia. É outra coisa —{" "}
          <span className="text-gradient-sage">e cabe no seu dia.</span>
        </h2>
      </div>

      <div className="max-w-3xl mx-auto rounded-3xl border border-border/60 bg-card overflow-hidden">
        <div className="grid grid-cols-3 px-6 py-4 text-xs uppercase tracking-[0.2em] text-muted-foreground border-b border-border/60">
          <span>aspecto</span>
          <span className="text-center">terapia tradicional</span>
          <span className="text-center text-primary">aura</span>
        </div>
        {rows.map((row, i) => (
          <div
            key={row.aspect}
            className={`grid grid-cols-3 px-6 py-5 items-center text-sm md:text-base ${
              i !== rows.length - 1 ? "border-b border-border/40" : ""
            }`}
          >
            <span className="text-foreground/90 font-medium">{row.aspect}</span>
            <span className="flex items-center justify-center gap-2 text-muted-foreground">
              <X className="w-4 h-4" />
              {row.traditional}
            </span>
            <span className="flex items-center justify-center gap-2 text-foreground">
              <Check className="w-4 h-4 text-primary" />
              {row.aura}
            </span>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground/70 mt-8 max-w-xl mx-auto">
        AURA é acompanhamento emocional — não substitui atendimento psicológico profissional. Em crise severa, procure ajuda especializada.
      </p>
    </div>
  </section>
);

export default ComparisonV2;
