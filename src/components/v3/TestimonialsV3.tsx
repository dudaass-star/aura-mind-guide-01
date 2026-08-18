const items = [
  {
    quote: "Durante meses eu ficava acordado remoendo o trabalho. A AURA me ajudou a enxergar o padrão e a parar de carregar tudo sozinho.",
    name: "Juliana M.",
    role: "29 anos",
  },
  {
    quote: "Fiquei dois meses travado numa decisão de carreira. Em uma semana com a AURA eu finalmente entendi o que me segurava e dei o primeiro passo.",
    name: "Carlos R.",
    role: "34 anos",
  },
  {
    quote: "Eu só existia, não vivia. A AURA me fez olhar pros pequenos momentos em que eu me sentia viva de verdade. Hoje eu construo meu dia em cima deles.",
    name: "Ana L.",
    role: "27 anos",
  },
];

const initials = (n: string) => n.split(" ").map(s => s[0]).slice(0, 2).join("");

const TestimonialsV3 = () => (
  <section id="depoimentos" className="relative py-24 md:py-32 bg-background">
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-[1fr_2fr] gap-12 max-w-6xl mx-auto items-start">
        <div>
          <h2 className="font-display text-3xl md:text-4xl font-medium leading-[1.15] tracking-tight text-foreground">
            Histórias reais,
            <br /> mudanças <span className="italic text-gradient-sage">reais.</span>
          </h2>
          <p className="mt-5 text-base text-muted-foreground max-w-sm">
            Pessoas que estavam travadas, remoendo ou só existindo — e encontraram direção com a AURA.
          </p>
          <figure className="mt-8 rounded-2xl bg-[hsl(var(--sage-soft))] p-6">
            <blockquote className="font-display text-xl md:text-2xl leading-snug text-foreground">
              “{items[0].quote}”
            </blockquote>
            <figcaption className="mt-4 text-sm text-foreground/70">
              {items[0].name}, {items[0].role}
            </figcaption>
          </figure>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {items.slice(1).map((it) => (
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

export default TestimonialsV3;
