const items = [
  {
    quote: "Às 3h da manhã, quando a ansiedade bate, a Aura tá lá. Me salvou em muitas noites.",
    name: "Fernanda L.",
    city: "São Paulo",
  },
  {
    quote: "Faz as perguntas que eu fujo de me fazer. Em uma semana já percebi diferença.",
    name: "Juliana M.",
    city: "Belo Horizonte",
  },
  {
    quote: "Eu não tinha condições de pagar terapia. A Aura me deu acesso a algo que eu achava que nunca ia ter.",
    name: "Carlos R.",
    city: "Recife",
  },
];

const TestimonialsV2 = () => (
  <section className="relative py-28 md:py-36 bg-background overflow-hidden">
    <div className="container mx-auto px-6 relative z-10">
      <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
        {items.map((it) => (
          <figure key={it.name} className="space-y-5">
            <blockquote className="font-display text-xl md:text-2xl leading-[1.35] text-foreground/95">
              “{it.quote}”
            </blockquote>
            <figcaption className="text-sm text-muted-foreground">
              <span className="text-foreground/90">{it.name}</span> · {it.city}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  </section>
);

export default TestimonialsV2;
