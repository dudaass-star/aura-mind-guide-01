import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";

const FinalCTAV3 = () => (
  <section className="relative py-20 md:py-28 v2-dark-section overflow-hidden">
    <div className="container mx-auto px-6">
      <div className="max-w-5xl mx-auto grid md:grid-cols-[auto_1fr_auto] gap-8 items-center">
        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mx-auto md:mx-0">
          <Heart className="w-9 h-9 text-primary" fill="currentColor" />
        </div>

        <div className="text-center md:text-left">
          <p className="text-xs uppercase tracking-[0.25em] text-white/65 mb-3">seu próximo capítulo</p>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-medium leading-[1.1] tracking-tight text-white">
            Não é apenas sobre atravessar
            <br className="hidden md:block" /> dias difíceis. É sobre <span className="italic text-gradient-sage">quem você está se tornando.</span>
          </h2>
          <p className="mt-4 text-base text-white/70">
            Comece no app Olá Aura. Converse por texto ou áudio, aprofunde o que importa
            em encontros guiados e veja seu percurso ganhar forma ao longo do tempo.
          </p>
        </div>

        <div className="flex flex-col items-center md:items-end gap-2">
          <Link
            to={checkoutHref("final", "v3")}
            onClick={() => trackLandingCta("final", "Quero começar agora (v3)", "v3")}
          >
            <Button variant="sage" size="xl" className="rounded-2xl px-8">
              Quero começar agora
            </Button>
          </Link>
          <p className="text-xs text-white/65 text-center md:text-right">
            7 dias por R$ 6,90 · cancela em 1 clique
            <br className="hidden md:block" /> reembolso em 7 dias
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default FinalCTAV3;
