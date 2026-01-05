import { Button } from "@/components/ui/button";
import { Star, Clock, Brain, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const Hero = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-hero pt-20">
      {/* Subtle decorative elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sage-soft rounded-full blur-3xl opacity-60 animate-pulse-soft" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-lavender-soft rounded-full blur-3xl opacity-50 animate-pulse-soft delay-200" />
      <div className="absolute top-1/3 right-1/3 w-64 h-64 bg-blush-soft rounded-full blur-3xl opacity-40 animate-pulse-soft delay-300" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Main headline */}
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6 animate-fade-up opacity-0">
            <span className="text-foreground">Você não deveria ter que escolher</span>
            <br />
            <span className="text-gradient-sage">entre saúde mental e pagar as contas.</span>
          </h1>

          {/* Subheadline */}
          <p className="font-body text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed animate-fade-up opacity-0 delay-100">
            A AURA te dá acompanhamento emocional profundo, com memória do seu histórico, 
            sessões estruturadas e suporte 24/7 — por menos de <span className="text-foreground font-semibold">R$2 por dia</span>.
          </p>

          {/* Trust badges - redesigned */}
          <div className="flex flex-wrap justify-center gap-4 md:gap-6 text-sm text-foreground mb-10 animate-fade-up opacity-0 delay-200">
            <div className="flex items-center gap-2 bg-amber-100/80 px-4 py-2 rounded-full border border-amber-200/50">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="font-medium">4.9/5 de satisfação</span>
            </div>
            <div className="flex items-center gap-2 bg-sage-soft/60 px-4 py-2 rounded-full">
              <Clock className="w-4 h-4 text-primary" />
              <span>Resposta em segundos</span>
            </div>
            <div className="flex items-center gap-2 bg-lavender-soft/60 px-4 py-2 rounded-full">
              <Brain className="w-4 h-4 text-accent" />
              <span>Memória de longo prazo</span>
            </div>
            <div className="flex items-center gap-2 bg-blush-soft/60 px-4 py-2 rounded-full">
              <Sparkles className="w-4 h-4 text-blush" />
              <span>Sessões com metodologia</span>
            </div>
          </div>

          {/* CTA */}
          <div className="flex flex-col items-center gap-4 animate-fade-up opacity-0 delay-300">
            <Link to="/checkout">
              <Button variant="sage" size="xl" className="min-w-[280px]">
                Começar com 5 conversas grátis
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground">
              Sem cartão de crédito. Sem compromisso.
            </p>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-float">
        <div className="w-6 h-10 rounded-full border-2 border-border flex items-start justify-center p-2">
          <div className="w-1 h-2 bg-primary rounded-full animate-pulse" />
        </div>
      </div>
    </section>
  );
};

export default Hero;
