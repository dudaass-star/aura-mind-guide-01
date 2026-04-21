import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Heart, ShieldCheck, XCircle, Lock } from "lucide-react";
import { trackCtaClick } from "@/lib/ga4";
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
          
          <p className="font-body text-lg md:text-xl text-muted-foreground mb-6 leading-relaxed">
            7 dias por R$ 6,90 — cancele antes de ser cobrado.
          </p>

          <p className="font-body text-base text-muted-foreground/80 mb-8 leading-relaxed italic max-w-2xl mx-auto">
            Você pode continuar tentando resolver tudo sozinho, remoendo os mesmos pensamentos amanhã. 
            Ou pode dar 5 minutos de atenção para si mesmo agora. Custa menos que um café e, no mínimo, 
            você vai dormir sabendo que alguém realmente te ouviu hoje.
          </p>

          <Link to="/checkout" onClick={() => trackCtaClick("final", "Começar por R$ 6,90")}>
            <Button variant="sage" size="xl" className="min-w-[280px] mb-6">
              Começar por R$ 6,90
            </Button>
          </Link>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/60 border border-border/50">
              <XCircle className="w-4 h-4 text-primary" /> Sem fidelidade
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/60 border border-border/50">
              <ShieldCheck className="w-4 h-4 text-primary" /> Cancele quando quiser
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card/60 border border-border/50">
              <Lock className="w-4 h-4 text-primary" /> Dados protegidos
            </span>
          </div>
          <p className="text-base text-accent font-semibold mt-4">+5.000 pessoas já começaram</p>
        </div>
      </div>
    </section>;
};
export default FinalCTA;