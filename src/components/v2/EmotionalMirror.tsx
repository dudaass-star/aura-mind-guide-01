const items = [
  "overthinking",
  "ansiedade silenciosa",
  "exaustão mental",
  "sensação de vazio",
  "pensamentos em loop",
  "noites sem desligar a mente",
];

const EmotionalMirror = () => (
  <section className="relative py-32 md:py-40 bg-background overflow-hidden">
    <div className="absolute top-1/2 left-0 w-[400px] h-[400px] v2-glow-lavender pointer-events-none" />

    <div className="container mx-auto px-6 relative z-10">
      <div className="max-w-3xl mx-auto">
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground">
          Tem gente que parece bem por fora{" "}
          <span className="text-muted-foreground">— mas está lutando contra a própria mente todos os dias.</span>
        </h2>

        <ul className="mt-16 space-y-5">
          {items.map((item) => (
            <li key={item} className="flex items-center gap-4 text-lg md:text-xl text-foreground/85">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

export default EmotionalMirror;
