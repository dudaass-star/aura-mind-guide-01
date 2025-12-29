import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const FinalCTA = () => {
  return (
    <section className="py-20 bg-lavender-soft/30 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-sage-soft/30 rounded-l-[100px] opacity-50" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
            Ainda em dúvida?
          </h2>
          <p className="font-body text-lg md:text-xl text-muted-foreground mb-10 leading-relaxed">
            Teste com 5 conversas grátis e veja se a AURA te entrega clareza de verdade.
          </p>
          <Link to="/checkout">
            <Button variant="sage" size="xl">
              Começar agora
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;