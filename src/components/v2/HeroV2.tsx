import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackCtaClick } from "@/lib/ga4";

const HeroV2 = () => (
  <section
    id="hero-section"
    className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background pt-24 pb-16"
  >
    {/* Glow cinematográfico atrás do título */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] v2-glow-sage v2-breathe pointer-events-none" />
    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] v2-glow-lavender v2-breathe pointer-events-none" style={{ animationDelay: "3s" }} />

    <div className="container mx-auto px-6 relative z-10">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-medium leading-[1.05] tracking-tight text-foreground v2-fade-up">
          Quando sua mente precisa,
          <br />
          <span className="text-gradient-sage">a Aura responde.</span>
        </h1>

        <p
          className="mt-8 text-lg md:text-xl text-muted-foreground max-w-xl mx-auto leading-relaxed v2-fade-up"
          style={{ animationDelay: "0.4s" }}
        >
          Converse, descarregue pensamentos e reorganize sua mente — direto no WhatsApp.
        </p>

        <div
          className="mt-12 flex flex-col items-center gap-3 v2-fade-up"
          style={{ animationDelay: "0.7s" }}
        >
          <Link to="/checkout" onClick={() => trackCtaClick("hero", "Começar por R$ 6,90 (v2)")}>
            <Button variant="sage" size="xl" className="min-w-[280px] rounded-full">
              Começar por R$ 6,90
            </Button>
          </Link>
          <p className="text-sm text-muted-foreground/80">
            7 dias por R$ 6,90 · Cancele quando quiser.
          </p>
        </div>
      </div>
    </div>

    {/* Indicador de scroll sutil */}
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 v2-fade-up" style={{ animationDelay: "1.4s" }}>
      <div className="w-px h-12 bg-gradient-to-b from-transparent via-foreground/30 to-transparent" />
    </div>
  </section>
);

export default HeroV2;
