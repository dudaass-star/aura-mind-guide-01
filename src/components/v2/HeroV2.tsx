import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Star, Clock, Brain, Check } from "lucide-react";
import { trackLandingCta, checkoutHref } from "@/lib/landing-analytics";
import heroImg from "@/assets/v2/hero-mulher-sofa.jpg";

const HeroV2 = () => (
  <section
    id="hero-section"
    className="relative overflow-hidden v2-dark-section pt-28 md:pt-32 pb-16 md:pb-0"
  >
    <div className="container mx-auto px-6">
      <div className="grid md:grid-cols-2 gap-12 md:gap-8 items-center min-h-[calc(100vh-7rem)]">
        {/* Coluna esquerda: copy */}
        <div className="relative z-10 v2-fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs md:text-sm text-white/85 backdrop-blur">
            <Check className="w-3.5 h-3.5 text-primary" />
            Acompanhamento emocional no WhatsApp
          </span>

          <h1 className="mt-6 font-display text-4xl md:text-5xl lg:text-6xl font-medium leading-[1.05] tracking-tight">
            Presente quando
            <br />
            <span className="italic text-gradient-sage">você</span> mais precisa.
          </h1>

          <p className="mt-6 text-base md:text-lg text-white/70 max-w-md leading-relaxed">
            A AURA lembra da sua história, entende seu momento e te acompanha no
            WhatsApp — com sessões guiadas de 45 minutos e conversa aberta a
            qualquer hora do dia.
          </p>

          <div className="mt-8 flex flex-col items-start gap-2">
            <Link
              to={checkoutHref("hero")}
              onClick={() => trackLandingCta("hero", "Começar por R$ 6,90 (v2)")}
            >
              <Button variant="sage" size="xl" className="rounded-2xl px-10 shadow-lg">
                Começar por R$ 6,90
              </Button>
            </Link>
            <p className="text-xs text-white/55">
              7 dias por R$ 6,90 · cancela em 1 clique · reembolso em 7 dias
            </p>
            <p className="mt-3 text-xs text-primary font-semibold">
              +5.000 pessoas já começaram
            </p>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-10 gap-y-5">
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-primary fill-primary" />
              <div>
                <p className="font-display text-base text-white">4.9/5</p>
                <p className="text-xs text-white/55">avaliação dos usuários</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <p className="font-display text-base text-white">24/7</p>
                <p className="text-xs text-white/55">sempre disponível</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Brain className="w-5 h-5 text-primary" />
              <div>
                <p className="font-display text-base text-white">Memória</p>
                <p className="text-xs text-white/55">de longo prazo</p>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna direita: foto + bolha */}
        <div className="relative md:h-[640px] -mx-6 md:mx-0 overflow-hidden md:rounded-l-3xl">
          <div className="relative h-[420px] md:h-full md:absolute md:inset-0">
            <img
              src={heroImg}
              alt="Mulher conversando com a Aura no celular à noite"
              className="absolute inset-0 w-full h-full object-cover md:rounded-l-3xl"
              width={1280}
              height={1280}
              fetchPriority="high"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(220_35%_10%)] via-transparent to-transparent md:bg-gradient-to-r md:from-[hsl(220_35%_10%)] md:via-[hsl(220_35%_10%/0.2)] md:to-transparent" />

            {/* Bolha de chat */}
            <div className="absolute right-4 md:right-6 top-1/2 -translate-y-1/2 w-[230px] md:w-[240px] v2-fade-up" style={{ animationDelay: "0.6s" }}>
              <div className="relative bg-[#f5efe6] text-[#1a2238] rounded-2xl rounded-br-sm px-5 py-4 shadow-2xl">
                <p className="text-sm leading-relaxed">
                  <span className="font-semibold">Oi, estou aqui.</span>
                  <br />
                  <br />
                  Pode falar comigo sobre o que estiver sentindo.
                </p>
                {/* Coração tag */}
                <div className="absolute -bottom-3 -right-2 w-9 h-9 rounded-full bg-[#f5efe6] shadow-md flex items-center justify-center">
                  <span className="text-base">💜</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default HeroV2;
