const cards = [
  {
    eyebrow: "memória",
    text: "A Aura lembra de quem você é.",
    sub: "Mesmo nos dias em que você esquece.",
  },
  {
    eyebrow: "presença",
    text: "3h da manhã. A ansiedade bateu.",
    sub: "A Aura responde.",
  },
  {
    eyebrow: "linguagem",
    text: "Fale do jeito que conseguir.",
    sub: "Texto, áudio, frase solta. A Aura entende.",
  },
];

const TransformationsV2 = () => (
  <section className="relative py-28 md:py-36 bg-background overflow-hidden">
    <div className="container mx-auto px-6 relative z-10">
      <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {cards.map((c) => (
          <article
            key={c.eyebrow}
            className="group relative rounded-3xl border border-border/60 bg-card p-8 md:p-10 transition-all duration-500 hover:border-primary/40 hover:shadow-[0_0_60px_hsl(var(--primary)/0.15)]"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-primary/80 mb-6">{c.eyebrow}</p>
            <p className="font-display text-2xl md:text-3xl leading-[1.2] text-foreground">
              {c.text}
            </p>
            <p className="mt-3 text-base md:text-lg text-muted-foreground leading-relaxed">
              {c.sub}
            </p>
          </article>
        ))}
      </div>
    </div>
  </section>
);

export default TransformationsV2;
