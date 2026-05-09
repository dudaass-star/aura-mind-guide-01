import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackCtaClick } from "@/lib/ga4";

const FinalCTAV2 = () => (
  <section className="relative py-32 md:py-44 bg-background overflow-hidden">
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] v2-glow-sage v2-breathe pointer-events-none" />

    <div className="container mx-auto px-6 relative z-10">
      <div className="max-w-3xl mx-auto text-center">
        <h2 className="font-display text-3xl md:text-5xl lg:text-6xl font-medium leading-[1.15] tracking-tight text-foreground">
          Tem noites em que sua mente pesa demais.
        </h2>
        <p className="mt-6 font-display text-2xl md:text-3xl text-muted-foreground leading-snug">
          A Aura foi criada para esses momentos.
        </p>

        <div className="mt-14 flex flex-col items-center gap-3">
          <Link to="/checkout" onClick={() => trackCtaClick("final", "Começar por R$ 6,90 (v2)")}>
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
  </section>
);

export default FinalCTAV2;
