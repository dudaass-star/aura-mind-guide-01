import { Helmet } from "react-helmet-async";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "@/styles/v2-theme.css";
import { Button } from "@/components/ui/button";
import {
  Star, ShieldCheck, Lock, MessageCircle, CalendarHeart, Sparkles, Check, X, Mic, Moon,
} from "lucide-react";
import AppTourV2 from "@/components/v2/AppTourV2";
import PricingV2 from "@/components/v2/PricingV2";
import FAQV2 from "@/components/v2/FAQV2";
import FooterV2 from "@/components/v2/FooterV2";
import { trackLandingCta, checkoutHref, useLandingEngagement, type CtaSource } from "@/lib/landing-analytics";
import { trackViewItem } from "@/lib/ga4";
import { trackMetaViewContent } from "@/lib/meta-pixel";
import "@/styles/v5-hero.css";

// Página V5: versão de alta conversão, independente da /v2.
const V = "v5" as const;

const Cta = ({ source, label = "Começar por R$ 6,90", className = "" }: { source: CtaSource; label?: string; className?: string }) => (
  <Link to={checkoutHref(source, V)} onClick={() => trackLandingCta(source, `${label} (v5)`, V)} className="block w-full sm:w-auto">
    <Button variant="sage" size="xl" className={`w-full sm:w-auto rounded-2xl px-10 shadow-lg ${className}`}>
      {label}
    </Button>
  </Link>
);

const Reassure = ({ dark = false }: { dark?: boolean }) => (
  <p className={`text-xs ${dark ? "text-[hsl(var(--v2-navy-muted))]" : "text-muted-foreground"}`}>
    7 dias por R$ 6,90 · cancele em 1 clique · reembolso em 7 dias
  </p>
);

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{children}</p>
);

const Header = () => (
  <header className="fixed inset-x-0 top-0 z-40 bg-[hsl(var(--v2-navy)/0.75)] backdrop-blur-md border-b border-[hsl(var(--v2-navy-foreground)/0.08)] text-[hsl(var(--v2-navy-foreground))]">
    <div className="container mx-auto px-5 h-14 flex items-center justify-between">
      <span className="font-display text-xl">Olá Aura</span>
      <Link to={checkoutHref("header", V)} onClick={() => trackLandingCta("header", "Começar (v5)", V)}>
        <Button variant="sage" size="sm" className="rounded-full px-5">Começar</Button>
      </Link>
    </div>
  </header>
);

const Hero = () => (
  <section id="hero-section" className="v5-hero relative pt-20 md:pt-28 pb-16 md:pb-24 overflow-hidden">
    <div className="v5-orb v5-orb-a" />
    <div className="v5-orb v5-orb-b" />
    <div className="v5-orb v5-orb-c" />
    <div className="container relative mx-auto px-5 grid md:grid-cols-2 gap-8 md:gap-12 items-center">
      <div className="text-center md:text-left v2-fade-up">
        <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--v2-navy-foreground)/0.15)] bg-[hsl(var(--v2-navy-foreground)/0.06)] px-3 py-1 text-xs text-[hsl(var(--v2-navy-foreground)/0.85)] backdrop-blur">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> AURA online agora
        </span>
        <h1 className="mt-4 font-sans font-semibold tracking-tight text-[2.15rem] leading-[1.05] md:text-6xl text-[hsl(var(--v2-navy-foreground))]">
          Sua mente merece <span className="v5-gradient-text">um lugar pra respirar.</span>
        </h1>
        <p className="mt-3 text-sm md:text-lg text-[hsl(var(--v2-navy-muted))] max-w-md mx-auto md:mx-0">
          Converse por texto ou áudio, 24h. A AURA lembra de você e te guia até a clareza.
        </p>
        <div className="hidden md:flex mt-7 flex-col gap-2 items-start">
          <Cta source="hero" />
          <Reassure dark />
        </div>
      </div>

      <div className="relative mx-auto w-[230px] md:w-[300px]">
        <div className="v5-phone">
          <div className="v5-notch" />
          <div className="v5-screen">
            <div className="flex items-center gap-2 pb-3 border-b border-[hsl(var(--v2-navy-foreground)/0.08)]">
              <div className="w-8 h-8 rounded-full v5-avatar" />
              <div className="text-left">
                <p className="text-xs font-semibold text-[hsl(var(--v2-navy-foreground))]">AURA</p>
                <p className="text-[10px] text-primary">escutando você…</p>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-[11px] md:text-xs text-left">
              <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2">Não consigo parar de pensar no que ele disse…</div>
              <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-[hsl(var(--v2-navy-foreground)/0.1)] text-[hsl(var(--v2-navy-foreground))] px-3 py-2">Semana passada você sentiu algo parecido com sua mãe. Quer olhar isso comigo?</div>
              <div className="max-w-[75%] rounded-2xl rounded-bl-sm bg-[hsl(var(--v2-navy-foreground)/0.1)] px-3 py-2 flex items-center gap-2">
                <Mic className="w-3.5 h-3.5 text-primary shrink-0" />
                <div className="flex items-end gap-[2px] h-4">
                  {[5,9,14,8,12,16,7,11,15,6,10,13,7].map((h, i) => (
                    <span key={i} className="v5-bar" style={{ height: h, animationDelay: `${i * 0.08}s` }} />
                  ))}
                </div>
                <span className="text-[10px] text-[hsl(var(--v2-navy-muted))]">0:24</span>
              </div>
            </div>
          </div>
        </div>
        <div className="v5-float v5-float-l">
          <CalendarHeart className="w-4 h-4 text-primary" />
          <div className="text-left leading-tight"><p className="text-[10px] opacity-70">Encontro guiado</p><p className="text-xs font-semibold">Hoje, 20h</p></div>
        </div>
        <div className="v5-float v5-float-r" style={{ animationDelay: "1.5s" }}>
          <Sparkles className="w-4 h-4 text-primary" />
          <p className="text-xs font-semibold">Oração da noite</p>
        </div>
      </div>

      <div className="md:hidden flex flex-col gap-2 items-stretch text-center">
        <Cta source="hero" />
        <Reassure dark />
      </div>
    </div>
  </section>
);

const Problem = () => {
  const items = [
    "Você pensa demais à noite e acorda cansada",
    "Sente que precisa desabafar, mas não quer pesar ninguém",
    "Já entendeu muita coisa, mas continua travada no mesmo lugar",
    "Terapia não cabe agora no tempo ou no bolso",
  ];
  return (
    <section className="py-16 md:py-24 bg-secondary/60">
      <div className="container mx-auto px-5 max-w-3xl text-center">
        <Eyebrow>Isso soa familiar?</Eyebrow>
        <h2 className="mt-3 font-display text-3xl md:text-4xl">Você não precisa carregar tudo sozinha.</h2>
        <ul className="mt-8 grid sm:grid-cols-2 gap-3 text-left">
          {items.map((t) => (
            <li key={t} className="flex gap-3 rounded-2xl bg-card border border-border/60 p-4 text-sm">
              <Check className="w-5 h-5 text-primary shrink-0" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

const Pillars = () => {
  const p = [
    { icon: MessageCircle, t: "Presença que lembra", d: "Converse quando precisar. A AURA guarda seu percurso — você nunca precisa recomeçar a história." },
    { icon: CalendarHeart, t: "Encontros com profundidade", d: "45 minutos com método, nova perspectiva e um resumo escrito para você levar." },
    { icon: Sparkles, t: "Paz em poucos minutos", d: "Orações e meditações guiadas para cada momento do seu dia e da sua noite." },
  ];
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-5 max-w-5xl">
        <div className="text-center max-w-2xl mx-auto">
          <Eyebrow>Como a AURA ajuda</Eyebrow>
          <h2 className="mt-3 font-display text-3xl md:text-4xl">Três formas de cuidar de você, num só lugar.</h2>
        </div>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {p.map(({ icon: I, t, d }) => (
            <div key={t} className="rounded-3xl bg-card border border-border/60 p-6 shadow-sm">
              <div className="w-11 h-11 rounded-2xl bg-[hsl(var(--sage-soft))] flex items-center justify-center"><I className="w-5 h-5 text-primary" /></div>
              <h3 className="mt-4 font-display text-xl">{t}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Compare = () => {
  const rows: [string, boolean, boolean][] = [
    ["Disponível às 3h da manhã", true, false],
    ["Lembra de tudo que você já contou", true, false],
    ["Encontros guiados com resumo", true, false],
    ["A partir de R$ 6,90 na primeira semana", true, false],
  ];
  return (
    <section className="py-16 md:py-24 v2-dark-section">
      <div className="container mx-auto px-5 max-w-3xl">
        <h2 className="text-center font-display text-3xl md:text-4xl">Diferente de desabafar no vazio.</h2>
        <div className="mt-8 rounded-3xl border border-border/40 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto] text-xs uppercase tracking-wider px-5 py-3 border-b border-border/40 text-muted-foreground">
            <span /> <span className="w-16 text-center text-primary">AURA</span> <span className="w-16 text-center">Sozinha</span>
          </div>
          {rows.map(([t, a, b]) => (
            <div key={t} className="grid grid-cols-[1fr_auto_auto] items-center px-5 py-4 border-b border-border/40 last:border-0 text-sm">
              <span>{t}</span>
              <span className="w-16 flex justify-center">{a && <Check className="w-5 h-5 text-primary" />}</span>
              <span className="w-16 flex justify-center">{!b && <X className="w-5 h-5 text-muted-foreground" />}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col items-center gap-2"><Cta source="demo" /><Reassure dark /></div>
      </div>
    </section>
  );
};

const Testimonials = () => {
  const t = [
    { tag: "Ansiedade", q: "Pela primeira vez consegui dormir sem ficar remoendo o dia. Ela me ajudou a enxergar o que eu evitava.", n: "M., 34 anos" },
    { tag: "Relacionamentos", q: "Percebi que eu sempre me colocava por último. O encontro mudou como eu converso com meu marido.", n: "R., 41 anos" },
    { tag: "Sobrecarga", q: "É como ter alguém que lembra de tudo e me devolve com carinho e honestidade.", n: "C., 29 anos" },
  ];
  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-5 max-w-5xl">
        <div className="text-center"><Eyebrow>Quem já começou</Eyebrow><h2 className="mt-3 font-display text-3xl md:text-4xl">Histórias reais de clareza.</h2></div>
        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {t.map((x) => (
            <figure key={x.n} className="rounded-3xl bg-card border border-border/60 p-6 shadow-sm flex flex-col">
              <div className="flex items-center justify-between">
                <div className="flex">{[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 text-primary fill-primary" />)}</div>
                <span className="text-[11px] rounded-full bg-[hsl(var(--lavender-soft))] px-2.5 py-1">{x.tag}</span>
              </div>
              <blockquote className="mt-4 font-display text-lg leading-snug flex-1">“{x.q}”</blockquote>
              <figcaption className="mt-4 text-xs text-muted-foreground">{x.n} · assinante verificada</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
};

const Guarantee = () => (
  <section className="py-14 md:py-20">
    <div className="container mx-auto px-5 max-w-3xl">
      <div className="rounded-3xl border-2 border-primary/30 bg-card p-7 md:p-10 text-center">
        <ShieldCheck className="w-12 h-12 text-primary mx-auto" />
        <h2 className="mt-4 font-display text-2xl md:text-3xl">Risco zero para experimentar.</h2>
        <p className="mt-3 text-muted-foreground text-sm md:text-base max-w-xl mx-auto">
          Use por 7 dias. Se não fizer sentido, cancele em 1 clique no próprio app e peça reembolso. Sem fidelidade, sem letras miúdas.
        </p>
      </div>
    </div>
  </section>
);

const FinalCta = () => (
  <section className="py-20 md:py-28 v2-dark-section text-center">
    <div className="container mx-auto px-5 max-w-2xl">
      <h2 className="font-display text-3xl md:text-5xl leading-tight">Hoje pode ser o primeiro dia de uma cabeça mais leve.</h2>
      <div className="mt-8 flex flex-col items-center gap-2"><Cta source="final" /><Reassure dark /></div>
    </div>
  </section>
);

const Sticky = () => {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("hero-section");
    if (!hero) return;
    const o = new IntersectionObserver(([e]) => setShow(!e.isIntersecting));
    o.observe(hero);
    return () => o.disconnect();
  }, []);
  if (!show) return null;
  return (
    <div className="md:hidden fixed inset-x-0 bottom-0 z-50 p-3 bg-background/90 backdrop-blur-md border-t border-border/50">
      <Link to={checkoutHref("sticky", V)} onClick={() => trackLandingCta("sticky", "Começar por R$ 6,90 (v5)", V)}>
        <Button variant="sage" size="lg" className="w-full rounded-full">Começar por R$ 6,90 · 7 dias</Button>
      </Link>
    </div>
  );
};

const IndexV5 = () => {
  useLandingEngagement(V);
  useEffect(() => {
    trackMetaViewContent({ content_name: "Landing V5", content_category: "homepage_v5" });
    trackViewItem({ item_id: "landing_v5", item_name: "Landing V5" });
  }, []);

  return (
    <>
      <Helmet>
        <title>Olá AURA — Fale com quem lembra de você</title>
        <meta name="description" content="Converse por texto ou áudio a qualquer hora, faça encontros guiados e ouça orações e meditações no app Olá Aura. 7 dias por R$ 6,90." />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Olá AURA — Fale com quem lembra de você" />
        <meta property="og:description" content="Acolhimento 24h, encontros guiados e orações no app Olá Aura. 7 dias por R$ 6,90." />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="theme-v2 min-h-screen bg-background text-foreground antialiased pb-20 md:pb-0">
        <Header />
        <main>
          <Hero />
          <Problem />
          <Pillars />
          <AppTourV2 />
          <Compare />
          <Testimonials />
          <PricingV2 />
          <Guarantee />
          <FAQV2 />
          <FinalCta />
        </main>
        <FooterV2 />
        <Sticky />
      </div>
    </>
  );
};

export default IndexV5;
