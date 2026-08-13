import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";

const FinalCTAV2 = () => (
  <section className="relative py-20 md:py-28 v2-dark-section overflow-hidden">
    <div className="container mx-auto px-6">
      <div className="max-w-5xl mx-auto grid md:grid-cols-[auto_1fr_auto] gap-8 items-center">
        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center mx-auto md:mx-0">
          <Heart className="w-9 h-9 text-primary" fill="currentColor" />
        </div>

        <div className="text-center md:text-left">
          <p className="text-xs uppercase tracking-[0.25em] text-white/65 mb-3">lembre-se</p>
          <h2 className="font-display text-3xl md:text-4xl lg:text-5xl font-medium leading-[1.1] tracking-tight text-white">
            Você não precisa enfrentar
            <br className="hidden md:block" /> tudo <span className="italic text-gradient-sage">sozinho.</span>
          </h2>
          <p className="mt-4 text-base text-white/70">
            Uma sessão de terapia custa cerca de R$ 200. Um mês inteiro com a
            AURA — conversas ilimitadas, sessões guiadas e memória da sua
            história — sai a partir de R$ 9,90.
          </p>
        </div>

        <div className="flex flex-col items-center md:items-end gap-2">
          <Link
            to={checkoutHref("final")}
            onClick={() => trackLandingCta("final", "Quero começar agora (v2)")}
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

export default FinalCTAV2;
