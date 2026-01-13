import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
const FinalCTA = () => {
  return <section className="py-24 bg-gradient-to-b from-lavender-soft/30 via-sage-soft/20 to-background relative overflow-hidden">
      <div className="absolute top-0 right-0 w-1/2 h-full bg-sage-soft/30 rounded-l-[100px] opacity-50" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <Heart className="w-12 h-12 text-primary mx-auto mb-6 opacity-60" />
          
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-bold text-foreground mb-6">
            Você merece apoio emocional.{" "}
            <span className="text-gradient-sage">E pode ter isso agora.</span>
          </h2>
          
          <p className="font-body text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
            5 conversas grátis + conteúdo semanal. Sem cartão. Sem compromisso.
          </p>

          <Link to="/experimentar">
            <Button variant="sage" size="xl" className="min-w-[280px] mb-6">
              Experimentar Grátis
            </Button>
          </Link>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            
            
            <span className="text-xl text-lavender font-bold">+5.000 pessoas já começaram</span>
          </div>
        </div>
      </div>
    </section>;
};
export default FinalCTA;