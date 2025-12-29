import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Economy = () => {
  return (
    <section className="py-20 bg-card relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-sage-soft/30 rounded-l-[100px] opacity-50" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-8 text-center">
            A conta é simples: acompanhamento constante <span className="text-gradient-sage">costuma ser caro.</span>
          </h2>

          <div className="bg-background rounded-3xl p-8 md:p-12 shadow-card border border-border/50 mb-8">
            <div className="space-y-6 text-lg md:text-xl text-foreground leading-relaxed">
              <p>
                Uma sessão por semana a R$150 dá{" "}
                <span className="font-bold text-destructive">R$600 por mês.</span>
              </p>
              <p>
                Duas sessões por semana dá{" "}
                <span className="font-bold text-destructive">R$1.200 por mês.</span>
              </p>
              <div className="pt-4 border-t border-border">
                <p>
                  A AURA custa{" "}
                  <span className="font-bold text-primary">R$27,90/mês</span> ou{" "}
                  <span className="font-bold text-primary">R$239,90/ano</span> e te acompanha no dia a dia, 
                  no WhatsApp, quando você precisa.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link to="/checkout">
              <Button variant="sage" size="xl">
                Testar 5 conversas grátis
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-4">
              Valores ilustrativos, variam por profissional e região.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Economy;