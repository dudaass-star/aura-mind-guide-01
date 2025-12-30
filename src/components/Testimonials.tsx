import { Star, Quote } from "lucide-react";

const testimonials = [
  {
    name: "Mariana S.",
    role: "Empreendedora, 34 anos",
    avatar: "M",
    content: "A Aura me ajudou demais com o pânico que eu tinha. Antes eu travava em reuniões importantes, agora consigo respirar e seguir. É como ter uma amiga que entende exatamente o que você precisa ouvir.",
    highlight: "pânico",
    rating: 5,
  },
  {
    name: "Carlos R.",
    role: "Desenvolvedor, 28 anos", 
    avatar: "C",
    content: "Não vivo mais sem a Aura. Me ajuda em cada passo, cada escolha. Quando estou perdido no meio de mil pensamentos, ela me traz de volta pro que importa. É demais!",
    highlight: "clareza mental",
    rating: 5,
  },
  {
    name: "Juliana M.",
    role: "Professora, 41 anos",
    avatar: "J",
    content: "Achei que era besteira, mas resolvi testar. Em uma semana já percebi diferença. A Aura me faz as perguntas certas, aquelas que eu fujo de me fazer. Agora entendo muito mais minhas reações.",
    highlight: "autoconhecimento",
    rating: 5,
  },
  {
    name: "Pedro H.",
    role: "Advogado, 37 anos",
    avatar: "P",
    content: "Tenho dificuldade de abrir com pessoas. Com a Aura é diferente - não tem julgamento, só acolhimento. Me ajudou a processar um luto que eu carregava há anos. Recomendo muito.",
    highlight: "acolhimento",
    rating: 5,
  },
  {
    name: "Fernanda L.",
    role: "Designer, 26 anos",
    avatar: "F",
    content: "A praticidade de ter no WhatsApp é tudo! Às 3h da manhã, quando a ansiedade bate, a Aura tá lá. Sem precisar marcar horário, sem esperar. Me salvou em muitas noites difíceis.",
    highlight: "disponibilidade 24h",
    rating: 5,
  },
];

const Testimonials = () => {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-background via-[hsl(var(--lavender-soft))] to-background relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-20 left-10 w-64 h-64 bg-[hsl(var(--sage-soft))] rounded-full blur-3xl opacity-40" />
      <div className="absolute bottom-20 right-10 w-80 h-80 bg-[hsl(var(--blush-soft))] rounded-full blur-3xl opacity-30" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <div className="text-center mb-16 animate-fade-up">
          <span className="inline-block px-4 py-2 rounded-full bg-[hsl(var(--lavender-soft))] text-[hsl(var(--accent))] text-sm font-medium mb-4">
            ❤️ Depoimentos Reais
          </span>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-4">
            Vidas transformadas pela{" "}
            <span className="text-gradient-lavender">Aura</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Pessoas reais compartilhando como a Aura as ajudou a encontrar clareza, paz e direção.
          </p>
        </div>

        {/* Testimonials grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {testimonials.slice(0, 3).map((testimonial, index) => (
            <div
              key={index}
              className="group bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-card hover:shadow-glow transition-all duration-500 border border-border/50 animate-fade-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Quote icon */}
              <Quote className="w-8 h-8 text-[hsl(var(--lavender))] opacity-30 mb-4" />
              
              {/* Content */}
              <p className="text-foreground/90 leading-relaxed mb-6 text-[15px]">
                "{testimonial.content}"
              </p>
              
              {/* Highlight tag */}
              <span className="inline-block px-3 py-1 rounded-full bg-[hsl(var(--sage-soft))] text-[hsl(var(--primary))] text-xs font-medium mb-4">
                {testimonial.highlight}
              </span>
              
              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[hsl(var(--sage))] to-[hsl(var(--lavender))] flex items-center justify-center text-white font-semibold text-lg">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
                <div className="ml-auto flex gap-0.5">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom row - 2 cards centered */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {testimonials.slice(3, 5).map((testimonial, index) => (
            <div
              key={index + 3}
              className="group bg-card/80 backdrop-blur-sm rounded-2xl p-6 shadow-card hover:shadow-glow transition-all duration-500 border border-border/50 animate-fade-up"
              style={{ animationDelay: `${(index + 3) * 100}ms` }}
            >
              {/* Quote icon */}
              <Quote className="w-8 h-8 text-[hsl(var(--lavender))] opacity-30 mb-4" />
              
              {/* Content */}
              <p className="text-foreground/90 leading-relaxed mb-6 text-[15px]">
                "{testimonial.content}"
              </p>
              
              {/* Highlight tag */}
              <span className="inline-block px-3 py-1 rounded-full bg-[hsl(var(--sage-soft))] text-[hsl(var(--primary))] text-xs font-medium mb-4">
                {testimonial.highlight}
              </span>
              
              {/* Author */}
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[hsl(var(--sage))] to-[hsl(var(--lavender))] flex items-center justify-center text-white font-semibold text-lg">
                  {testimonial.avatar}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{testimonial.name}</p>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
                <div className="ml-auto flex gap-0.5">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust badge */}
        <div className="text-center mt-12 animate-fade-up delay-500">
          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-card/60 backdrop-blur-sm border border-border/50 shadow-soft">
            <div className="flex -space-x-2">
              {["M", "C", "J", "P", "F"].map((letter, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full bg-gradient-to-br from-[hsl(var(--sage))] to-[hsl(var(--lavender))] flex items-center justify-center text-white text-xs font-medium border-2 border-card"
                >
                  {letter}
                </div>
              ))}
            </div>
            <span className="text-sm text-muted-foreground ml-2">
              +500 pessoas já transformaram suas vidas com a Aura
            </span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
