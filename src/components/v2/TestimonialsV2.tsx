const items = [
  {
    quote: "A AURA me ajudou a entender meus padrões de ansiedade e a lidar melhor com eles. É como ter alguém que realmente me entende.",
    name: "Juliana M.",
    role: "29 anos",
  },
  {
    quote: "Nos momentos mais difíceis, a AURA estava lá. Sem julgamentos, só acolhimento e as perguntas certas. Foi transformador.",
    name: "Carlos R.",
    role: "34 anos",
  },
  {
    quote: "Finalmente encontrei algo que cabe na minha rotina e no meu bolso. A AURA mudou minha relação comigo mesma. Sou muito grata!",
    name: "Ana L.",
    role: "27 anos",
  },
];

const initials = (n: string) => n.split(" ").map(s => s[0]).slice(0, 2).join("");

const TestimonialsV2 = () => (
  <section id="depoimentos" className="relative py-24 md:py-32 bg-background">
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-[1fr_2fr] gap-12 max-w-6xl mx-auto items-start">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-medium leading-[1.15] tracking-tight text-foreground">
            Histórias reais,
            <br /> transformações <span className="italic text-gradient-sage">reais.</span>
          </h2>
          <p className="mt-5 text-base text-muted-foreground max-w-sm">
            Pessoas reais compartilhando como a AURA fez diferença nas suas vidas.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          {items.map((it) => (
            <figure key={it.name} className="rounded-2xl bg-card border border-border/40 p-6 flex flex-col">
              <span className="font-display text-3xl text-primary leading-none mb-3">“</span>
              <blockquote className="text-sm text-foreground/85 leading-relaxed flex-grow">
                {it.quote}
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3 pt-4 border-t border-border/40">
                <div className="w-10 h-10 rounded-full bg-[hsl(var(--sage-soft))] flex items-center justify-center text-primary font-display text-sm">
                  {initials(it.name)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{it.name}</p>
                  <p className="text-xs text-muted-foreground">{it.role}</p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default TestimonialsV2;
