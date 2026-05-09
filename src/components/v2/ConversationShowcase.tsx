const scenes: Array<{ user: string; aura: string }> = [
  {
    user: "Minha mente não para.",
    aura: "Você está carregando mais do que consegue processar sozinho.",
  },
  {
    user: "São 3h da manhã e a ansiedade bateu.",
    aura: "Eu tô aqui. Respira comigo — me conta o que tá te tirando o sono.",
  },
  {
    user: "Hoje eu nem sei como eu tô.",
    aura: "Tudo bem não saber. A gente descobre junto, sem pressa.",
  },
  {
    user: "Acho que tô me afastando de mim mesmo.",
    aura: "Isso que você acabou de falar é mais lúcido do que parece.",
  },
];

const ConversationShowcase = () => (
  <section className="relative py-28 md:py-36 bg-background overflow-hidden">
    <div className="absolute top-0 right-0 w-[600px] h-[600px] v2-glow-sage pointer-events-none" />

    <div className="container mx-auto px-6 relative z-10">
      <div className="max-w-2xl mx-auto text-center mb-20">
        <p className="text-sm uppercase tracking-[0.25em] text-primary/80 mb-4">conversas reais</p>
        <h2 className="font-display text-3xl md:text-5xl font-medium leading-[1.15] tracking-tight text-foreground">
          É no meio da conversa que a Aura{" "}
          <span className="text-gradient-sage">vira real.</span>
        </h2>
      </div>

      <div className="max-w-2xl mx-auto space-y-16">
        {scenes.map((scene, i) => (
          <div key={i} className="space-y-3">
            {/* Bolha do usuário — alinhada à direita */}
            <div className="flex justify-end">
              <div
                className="max-w-[85%] md:max-w-[75%] rounded-3xl rounded-tr-md px-5 py-4 bg-secondary text-secondary-foreground text-base md:text-lg leading-relaxed shadow-sm v2-bubble-in"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                {scene.user}
              </div>
            </div>

            {/* Bolha da Aura — alinhada à esquerda */}
            <div className="flex justify-start">
              <div
                className="max-w-[85%] md:max-w-[75%] rounded-3xl rounded-tl-md px-5 py-4 bg-card text-card-foreground border border-border/60 text-base md:text-lg leading-relaxed shadow-[0_0_40px_hsl(var(--primary)/0.08)] v2-bubble-in"
                style={{ animationDelay: `${i * 0.1 + 0.25}s` }}
              >
                {scene.aura}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default ConversationShowcase;
